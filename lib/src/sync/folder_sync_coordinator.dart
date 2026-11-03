import 'dart:async';
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../model/finance_operation.dart';
import '../model/finance_snapshot.dart';
import '../model/state_projection.dart';
import '../repository/finance_repository.dart';
import 'sync_folder.dart';

enum FolderSyncPhase { disabled, idle, syncing, blocked, error }

class FolderSyncStatus {
  const FolderSyncStatus({
    required this.phase,
    this.message = '',
    this.lastSyncAt,
  });

  final FolderSyncPhase phase;
  final String message;
  final DateTime? lastSyncAt;
}

class FolderSyncCoordinator {
  FolderSyncCoordinator(this.repository);

  final FinanceRepository repository;
  final _status = StreamController<FolderSyncStatus>.broadcast();
  Timer? _timer;
  Timer? _watchDebounce;
  StreamSubscription<Object?>? _watchSubscription;
  SyncFolder? _folder;
  bool _running = false;
  String? _pendingApprovalHash;
  FolderSyncStatus _currentStatus = const FolderSyncStatus(
    phase: FolderSyncPhase.disabled,
  );

  // In-memory caches of verified immutable artifacts to avoid re-reading and
  // re-hashing unchanged files on every sync tick.
  final Map<String, FinanceSnapshot> _verifiedSnapshots = {};
  final Map<String, FinanceOperation> _verifiedOperations = {};
  final Map<String, FinanceOperation> _cachedLocalOperations = {};
  String? _lastSnapshotStateHash;
  String? _lastRemoteSignature;

  static const _maximumSnapshotBytes = 10 * 1024 * 1024;
  static const _maximumOperationBytes = 2 * 1024 * 1024;
  static const _approvedIntegrityFaultKey = 'finance_approved_integrity_fault';

  Stream<FolderSyncStatus> get statuses => _status.stream;
  FolderSyncStatus get currentStatus => _currentStatus;
  String? get root => _folder?.root;
  bool get canApprovePending => _pendingApprovalHash != null;

  void _resetCaches() {
    _verifiedSnapshots.clear();
    _verifiedOperations.clear();
    _cachedLocalOperations.clear();
    _lastSnapshotStateHash = null;
    _lastRemoteSignature = null;
  }

  Future<void> start() async {
    final preferences = await SharedPreferences.getInstance();
    final root = preferences.getString('finance_sync_root');
    if (root == null || root.isEmpty) {
      _emit(const FolderSyncStatus(phase: FolderSyncPhase.disabled));
      return;
    }
    _folder = SyncFolder.fromRoot(root);
    _resetCaches();
    _schedule();
    await syncNow();
  }

  Future<bool> chooseFolder() async {
    final root = await SyncFolder.pick();
    if (root == null || root.isEmpty) return false;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString('finance_sync_root', root);
    await preferences.remove(_approvedIntegrityFaultKey);
    _folder = SyncFolder.fromRoot(root);
    _resetCaches();
    _schedule();
    await syncNow();
    return true;
  }

  Future<void> clearFolder() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove('finance_sync_root');
    await preferences.remove(_approvedIntegrityFaultKey);
    _folder = null;
    _timer?.cancel();
    _watchDebounce?.cancel();
    await _watchSubscription?.cancel();
    _watchSubscription = null;
    _pendingApprovalHash = null;
    _resetCaches();
    _emit(const FolderSyncStatus(phase: FolderSyncPhase.disabled));
  }

  void _schedule() {
    _timer?.cancel();
    _watchDebounce?.cancel();
    unawaited(_watchSubscription?.cancel());
    _watchSubscription = null;

    final watcher = _folder?.watch();
    if (watcher != null) {
      _watchSubscription = watcher.listen((_) {
        _watchDebounce?.cancel();
        _watchDebounce = Timer(const Duration(milliseconds: 600), syncNow);
      }, onError: (_) {});
      // When native filesystem events are active, poll less frequently as a safety net.
      _timer = Timer.periodic(const Duration(seconds: 20), (_) => syncNow());
    } else {
      // On Android SAF, avoid hammering ContentResolver every 4s.
      _timer = Timer.periodic(const Duration(seconds: 15), (_) => syncNow());
    }
  }

  Future<void> approvePendingSync() async {
    final approval = _pendingApprovalHash;
    if (approval == null) return;
    await syncNow(approvedCandidateHash: approval);
  }

  Future<void> syncNow({String? approvedCandidateHash}) async {
    final folder = _folder;
    if (folder == null || _running) return;
    _running = true;
    final previousStatus = _currentStatus;
    try {
      var remoteFiles = (await folder.listFiles()).toSet();
      final localOperations = await repository.localOperationFiles();
      final currentLocalStateHash = contentHash(
        portableFinanceState(repository.state),
      );
      final remoteSignature =
          '${(remoteFiles.toList()..sort()).join('|')}::${localOperations.length}::$currentLocalStateHash';

      // Fast path: if nothing changed on disk or in local state and we are already idle,
      // skip re-reading files or emitting redundant syncing/idle status churn.
      if (approvedCandidateHash == null &&
          _pendingApprovalHash == null &&
          previousStatus.phase == FolderSyncPhase.idle &&
          _lastRemoteSignature == remoteSignature) {
        return;
      }

      _emit(const FolderSyncStatus(phase: FolderSyncPhase.syncing));
      final integrityFaults = <String>[];

      for (final file in localOperations) {
        String? source;
        try {
          var operation = _cachedLocalOperations[file.path];
          if (operation == null) {
            source = await file.readAsString();
            operation = await repository.readLocalOperation(file);
            _cachedLocalOperations[file.path] = operation;
          }
          if (remoteFiles.contains(operation.relativePath)) continue;
          await folder.writeText(
            operation.relativePath,
            const JsonEncoder.withIndent(' ').convert(operation.toJson()),
          );
          remoteFiles.add(operation.relativePath);
          _verifiedOperations[operation.relativePath] = operation;
        } catch (_) {
          _cachedLocalOperations.remove(file.path);
          integrityFaults.add(
            _faultFingerprint('Invalid local operation', file.path, source),
          );
        }
      }

      final snapshotPaths =
          remoteFiles
              .where(
                (path) =>
                    path.startsWith('finance-os/snapshots/') &&
                    path.endsWith('.json'),
              )
              .toList()
            ..sort();
      _verifiedSnapshots.removeWhere((k, _) => !remoteFiles.contains(k));
      final remoteSnapshots = <FinanceSnapshot>[];
      for (final path in snapshotPaths) {
        final cached = _verifiedSnapshots[path];
        if (cached != null) {
          remoteSnapshots.add(cached);
          continue;
        }
        String? source;
        try {
          source = await folder.readText(path);
          if (utf8.encode(source).length > _maximumSnapshotBytes) {
            throw const FormatException('snapshot exceeds the size limit');
          }
          final raw = jsonDecode(source);
          if (raw is! Map) {
            throw const FormatException('snapshot is not a JSON object');
          }
          final snapshot = FinanceSnapshot.fromJson(
            raw.map((key, value) => MapEntry(key.toString(), value)),
          );
          if (snapshot.relativePath != path) {
            throw const FormatException(
              'snapshot identity does not match path',
            );
          }
          _verifiedSnapshots[path] = snapshot;
          remoteSnapshots.add(snapshot);
        } catch (_) {
          integrityFaults.add(
            _faultFingerprint('Invalid snapshot', path, source),
          );
        }
      }
      remoteSnapshots.sort((left, right) {
        final coverage = left.coverageScore.compareTo(right.coverageScore);
        if (coverage != 0) return coverage;
        final created = left.createdAt.compareTo(right.createdAt);
        if (created != 0) return created;
        return left.snapshotId.compareTo(right.snapshotId);
      });
      final latestSnapshot = remoteSnapshots.lastOrNull;

      final operationPaths =
          remoteFiles
              .where(
                (path) =>
                    path.startsWith('finance-os/operations/') &&
                    path.endsWith('.json'),
              )
              .toList()
            ..sort();
      _verifiedOperations.removeWhere((k, _) => !remoteFiles.contains(k));
      final folderOperations = <FinanceOperation>[];
      final operationIdentities = <String, String>{};
      final operationSequences = <String, String>{};
      for (final path in operationPaths) {
        String? source;
        try {
          var operation = _verifiedOperations[path];
          if (operation == null) {
            source = await folder.readText(path);
            if (utf8.encode(source).length > _maximumOperationBytes) {
              throw const FormatException('operation exceeds the size limit');
            }
            final raw = jsonDecode(source);
            if (raw is! Map) {
              throw const FormatException('operation is not a JSON object');
            }
            operation = FinanceOperation.fromJson(
              raw.map((key, value) => MapEntry(key.toString(), value)),
            );
            if (operation.relativePath != path) {
              throw const FormatException(
                'operation identity does not match path',
              );
            }
            _verifiedOperations[path] = operation;
          }
          final existingHash = operationIdentities[operation.opId];
          if (existingHash != null && existingHash != operation.operationHash) {
            throw const FormatException(
              'operation ID has conflicting contents',
            );
          }
          final sequenceKey =
              '${operation.deviceId}/${operation.deviceSequence}';
          final existingSequence = operationSequences[sequenceKey];
          if (existingSequence != null && existingSequence != operation.opId) {
            throw const FormatException('device sequence is duplicated');
          }
          operationIdentities[operation.opId] = operation.operationHash;
          operationSequences[sequenceKey] = operation.opId;
          folderOperations.add(operation);
        } catch (_) {
          _verifiedOperations.remove(path);
          integrityFaults.add(
            _faultFingerprint('Invalid operation', path, source),
          );
        }
      }

      if (snapshotPaths.isEmpty && repository.lastLoadedSnapshotId != null) {
        integrityFaults.add(
          'The folder previously contained snapshots but now contains none.',
        );
      }
      if (snapshotPaths.isNotEmpty && remoteSnapshots.isEmpty) {
        integrityFaults.add('No valid full snapshot remains in the folder.');
      }

      if (integrityFaults.isNotEmpty) {
        final approvalHash = contentHash({
          'kind': 'integrity-faults',
          'root': folder.root,
          'faults': integrityFaults..sort(),
          'localState': contentHash(portableFinanceState(repository.state)),
        });
        final preferences = await SharedPreferences.getInstance();
        final acknowledgedHash = preferences.getString(
          _approvedIntegrityFaultKey,
        );
        if (approvedCandidateHash != approvalHash &&
            acknowledgedHash != approvalHash) {
          _pendingApprovalHash = approvalHash;
          _emit(
            FolderSyncStatus(
              phase: FolderSyncPhase.blocked,
              message:
                  '${integrityFaults.length} damaged or missing sync '
                  'artifacts were quarantined. No incoming data was applied.',
            ),
          );
          return;
        }
        if (approvedCandidateHash == approvalHash) {
          await preferences.setString(_approvedIntegrityFaultKey, approvalHash);
        }
        await repository.createManualRestorePoint();
      } else {
        final preferences = await SharedPreferences.getInstance();
        await preferences.remove(_approvedIntegrityFaultKey);
      }

      final result = await repository.reconcilePortableFolder(
        latestSnapshot,
        folderOperations,
        approvedCandidateHash: approvedCandidateHash,
      );
      if (result.isBlocked) {
        _pendingApprovalHash = result.candidateHash;
        _emit(
          FolderSyncStatus(
            phase: FolderSyncPhase.blocked,
            message: result.blockedReasons.join(' '),
          ),
        );
        return;
      }

      // Only build and write a new portable snapshot when the state hash has
      // changed or no snapshot exists yet.
      if (latestSnapshot == null ||
          _lastSnapshotStateHash != result.candidateHash) {
        final currentSnapshot = await repository.createPortableSnapshot();
        if (latestSnapshot?.snapshotHash == currentSnapshot.snapshotHash) {
          if (repository.lastLoadedSnapshotId != latestSnapshot!.snapshotId) {
            await repository.markSnapshotAvailable(latestSnapshot.snapshotId);
          }
        } else {
          await folder.writeText(
            currentSnapshot.relativePath,
            const JsonEncoder.withIndent(
              '  ',
            ).convert(currentSnapshot.toJson()),
          );
          remoteFiles.add(currentSnapshot.relativePath);
          _verifiedSnapshots[currentSnapshot.relativePath] = currentSnapshot;
          await repository.markSnapshotAvailable(currentSnapshot.snapshotId);
          remoteSnapshots.add(currentSnapshot);
        }
        _lastSnapshotStateHash = result.candidateHash;
      }

      _pendingApprovalHash = null;
      _lastRemoteSignature =
          '${(remoteFiles.toList()..sort()).join('|')}::${localOperations.length}::${result.candidateHash}';
      _emit(
        FolderSyncStatus(
          phase: FolderSyncPhase.idle,
          message:
              '${remoteSnapshots.length} full snapshots, '
              '${folderOperations.length} verified operations',
          lastSyncAt: DateTime.now(),
        ),
      );
    } catch (error) {
      _emit(
        FolderSyncStatus(
          phase: FolderSyncPhase.error,
          message: error.toString(),
        ),
      );
    } finally {
      _running = false;
    }
  }

  void _emit(FolderSyncStatus value) {
    _currentStatus = value;
    _status.add(value);
  }

  static String _faultFingerprint(String kind, String path, String? source) =>
      '$kind:$path:${source == null ? 'unreadable' : contentHash(source)}';

  Future<void> dispose() async {
    _timer?.cancel();
    _watchDebounce?.cancel();
    await _watchSubscription?.cancel();
    await _status.close();
  }
}

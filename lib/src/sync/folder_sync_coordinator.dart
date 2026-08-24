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
  SyncFolder? _folder;
  bool _running = false;
  String? _pendingApprovalHash;
  FolderSyncStatus _currentStatus = const FolderSyncStatus(
    phase: FolderSyncPhase.disabled,
  );

  static const _maximumSnapshotBytes = 10 * 1024 * 1024;
  static const _maximumOperationBytes = 2 * 1024 * 1024;
  static const _approvedIntegrityFaultKey = 'finance_approved_integrity_fault';

  Stream<FolderSyncStatus> get statuses => _status.stream;
  FolderSyncStatus get currentStatus => _currentStatus;
  String? get root => _folder?.root;
  bool get canApprovePending => _pendingApprovalHash != null;

  Future<void> start() async {
    final preferences = await SharedPreferences.getInstance();
    final root = preferences.getString('finance_sync_root');
    if (root == null || root.isEmpty) {
      _emit(const FolderSyncStatus(phase: FolderSyncPhase.disabled));
      return;
    }
    _folder = SyncFolder.fromRoot(root);
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
    _pendingApprovalHash = null;
    _emit(const FolderSyncStatus(phase: FolderSyncPhase.disabled));
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => syncNow());
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
    _emit(const FolderSyncStatus(phase: FolderSyncPhase.syncing));
    try {
      var remoteFiles = (await folder.listFiles()).toSet();
      final integrityFaults = <String>[];
      final localOperations = await repository.localOperationFiles();
      for (final file in localOperations) {
        String? source;
        try {
          source = await file.readAsString();
          final operation = await repository.readLocalOperation(file);
          if (remoteFiles.contains(operation.relativePath)) continue;
          await folder.writeText(
            operation.relativePath,
            const JsonEncoder.withIndent(' ').convert(operation.toJson()),
          );
          remoteFiles.add(operation.relativePath);
        } catch (_) {
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
      final remoteSnapshots = <FinanceSnapshot>[];
      for (final path in snapshotPaths) {
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
      final folderOperations = <FinanceOperation>[];
      final operationIdentities = <String, String>{};
      final operationSequences = <String, String>{};
      for (final path in operationPaths) {
        String? source;
        try {
          source = await folder.readText(path);
          if (utf8.encode(source).length > _maximumOperationBytes) {
            throw const FormatException('operation exceeds the size limit');
          }
          final raw = jsonDecode(source);
          if (raw is! Map) {
            throw const FormatException('operation is not a JSON object');
          }
          final operation = FinanceOperation.fromJson(
            raw.map((key, value) => MapEntry(key.toString(), value)),
          );
          if (operation.relativePath != path) {
            throw const FormatException(
              'operation identity does not match path',
            );
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

      // A complete immutable snapshot makes this folder sufficient to recover
      // the app on a clean device. Operations remain for concurrent merging.
      final currentSnapshot = await repository.createPortableSnapshot();
      if (latestSnapshot?.snapshotHash == currentSnapshot.snapshotHash) {
        if (repository.lastLoadedSnapshotId != latestSnapshot!.snapshotId) {
          await repository.markSnapshotAvailable(latestSnapshot.snapshotId);
        }
      } else {
        await folder.writeText(
          currentSnapshot.relativePath,
          const JsonEncoder.withIndent('  ').convert(currentSnapshot.toJson()),
        );
        remoteFiles.add(currentSnapshot.relativePath);
        await repository.markSnapshotAvailable(currentSnapshot.snapshotId);
        remoteSnapshots.add(currentSnapshot);
      }

      _pendingApprovalHash = null;
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
    await _status.close();
  }
}

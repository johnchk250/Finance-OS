import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../model/finance_operation.dart';
import '../model/finance_snapshot.dart';
import '../model/state_projection.dart';
import '../model/version_vector.dart';
import '../safety/safety_vault.dart';
import '../safety/sync_safety.dart';

class ReconciliationResult {
  const ReconciliationResult({
    required this.changed,
    required this.newlyApplied,
    required this.candidateHash,
    this.blockedReasons = const [],
  });

  final bool changed;
  final int newlyApplied;
  final String candidateHash;
  final List<String> blockedReasons;

  bool get isBlocked => blockedReasons.isNotEmpty;
}

class FinanceRepository {
  FinanceRepository._(
    this._supportDirectory,
    this.deviceId,
    this._state,
    this._nextSequence,
    this._vectors,
    this._winners,
    this._appliedOperations,
    this._conflicts,
    this._lastLoadedSnapshotId,
    this._safetyVault,
  );

  static const _uuid = Uuid();
  static const _metadataVersion = 3;

  final Directory _supportDirectory;
  final String deviceId;
  Map<String, dynamic> _state;
  int _nextSequence;
  final Map<String, VersionVector> _vectors;
  final Map<String, String> _winners;
  final Set<String> _appliedOperations;
  final List<Map<String, dynamic>> _conflicts;
  String? _lastLoadedSnapshotId;
  final SafetyVault _safetyVault;
  final _changes = StreamController<Map<String, dynamic>>.broadcast();
  Future<void> _mutationQueue = Future<void>.value();

  File get _stateFile => File(p.join(_supportDirectory.path, 'state.json'));
  File get _metadataFile =>
      File(p.join(_supportDirectory.path, 'sync_metadata.json'));
  Directory get _operationDirectory =>
      Directory(p.join(_supportDirectory.path, 'operations'));

  Stream<Map<String, dynamic>> get changes => _changes.stream;
  Map<String, dynamic> get state => cloneJsonMap(_state);
  int get conflictCount => _conflicts.length;
  String? get lastLoadedSnapshotId => _lastLoadedSnapshotId;
  bool hasApplied(String opId) => _appliedOperations.contains(opId);

  static Future<FinanceRepository> open() async {
    final root = await getApplicationSupportDirectory();
    final support = Directory(p.join(root.path, 'FinanceOSSynced'))
      ..createSync(recursive: true);
    final safetyVault = SafetyVault(
      Directory(p.join(support.path, 'safety-vault')),
    );
    final preferences = await SharedPreferences.getInstance();
    var deviceId = preferences.getString('finance_device_id');
    if (deviceId == null || deviceId.isEmpty) {
      deviceId = _uuid.v4();
      await preferences.setString('finance_device_id', deviceId);
    }

    final stateFile = File(p.join(support.path, 'state.json'));
    final seedState = _decodeMap(
      await rootBundle.loadString('assets/finance/seed_state.json'),
    );
    Map<String, dynamic> state;
    if (stateFile.existsSync()) {
      try {
        state = _decodeMap(await stateFile.readAsString());
      } catch (_) {
        await _preserveCorruptFile(stateFile);
        final restorePoints = await safetyVault.listRestorePoints();
        state = restorePoints.isEmpty
            ? seedState
            : mergePortableFinanceState(restorePoints.first.state, seedState);
        await _atomicWrite(
          stateFile,
          const JsonEncoder.withIndent(' ').convert(state),
        );
      }
    } else {
      state = seedState;
      await _atomicWrite(
        stateFile,
        const JsonEncoder.withIndent(' ').convert(state),
      );
    }

    final metadataFile = File(p.join(support.path, 'sync_metadata.json'));
    var nextSequence = 1;
    final vectors = <String, VersionVector>{};
    final winners = <String, String>{};
    final applied = <String>{};
    final conflicts = <Map<String, dynamic>>[];
    String? lastLoadedSnapshotId;
    if (metadataFile.existsSync()) {
      try {
        final metadata = _decodeMap(await metadataFile.readAsString());
        nextSequence = (metadata['nextSequence'] as num?)?.toInt() ?? 1;
        final rawVectors = metadata['vectors'];
        if (rawVectors is Map) {
          for (final entry in rawVectors.entries) {
            vectors[entry.key.toString()] = VersionVector.fromJson(entry.value);
          }
        }
        final rawWinners = metadata['winners'];
        if (rawWinners is Map) {
          for (final entry in rawWinners.entries) {
            winners[entry.key.toString()] = entry.value.toString();
          }
        }
        final rawApplied = metadata['appliedOperations'];
        if (rawApplied is List) {
          applied.addAll(rawApplied.map((e) => e.toString()));
        }
        final rawConflicts = metadata['conflicts'];
        if (rawConflicts is List) {
          conflicts.addAll(
            rawConflicts.whereType<Map>().map(
              (entry) =>
                  entry.map((key, value) => MapEntry(key.toString(), value)),
            ),
          );
        }
        lastLoadedSnapshotId = metadata['lastLoadedSnapshotId']?.toString();
      } catch (_) {
        await _preserveCorruptFile(metadataFile);
        vectors.clear();
        winners.clear();
        applied.clear();
        conflicts.clear();
      }
    }

    final operationDirectory = Directory(p.join(support.path, 'operations'));
    if (operationDirectory.existsSync()) {
      await for (final entity in operationDirectory.list()) {
        if (entity is! File || !entity.path.endsWith('.json')) continue;
        final name = p.basenameWithoutExtension(entity.path);
        final separator = name.indexOf('-');
        final sequence = int.tryParse(
          separator < 0 ? name : name.substring(0, separator),
        );
        if (sequence != null && sequence >= nextSequence) {
          nextSequence = sequence + 1;
        }
      }
    }

    final repository = FinanceRepository._(
      support,
      deviceId,
      state,
      nextSequence,
      vectors,
      winners,
      applied,
      conflicts,
      lastLoadedSnapshotId,
      safetyVault,
    );
    await safetyVault.createRestorePoint(
      state,
      reason: 'Initial safety baseline',
    );
    return repository;
  }

  Future<List<SafetyRestorePoint>> safetyRestorePoints() =>
      _safetyVault.listRestorePoints();

  Future<SafetyRestorePoint?> createManualRestorePoint() => _serializeMutation(
    () =>
        _safetyVault.createRestorePoint(_state, reason: 'Manual restore point'),
  );

  Future<bool> restoreSafetyPoint(String backupId) =>
      _serializeMutation(() async {
        final restorePoint = await _safetyVault.find(backupId);
        if (restorePoint == null) return false;
        final restored = mergePortableFinanceState(restorePoint.state, _state);
        if (contentHash(portableFinanceState(restored)) ==
            contentHash(portableFinanceState(_state))) {
          return true;
        }
        await _safetyVault.createRestorePoint(
          _state,
          reason: 'Before restoring ${restorePoint.createdAt.toLocal()}',
        );
        await _saveFromWeb(jsonEncode(restored), createSafetyBackup: false);
        return true;
      });

  Future<FinanceSnapshot> createPortableSnapshot() =>
      _serializeMutation(() async {
        final portableState = portableFinanceState(_state);
        final vectors = Map<String, VersionVector>.from(_vectors);
        final winners = Map<String, String>.from(_winners);
        return FinanceSnapshot(
          snapshotId: _uuid.v4(),
          deviceId: deviceId,
          createdAt: DateTime.now().toUtc(),
          state: portableState,
          vectors: vectors,
          winners: winners,
          snapshotHash: FinanceSnapshot.calculateHash(
            state: portableState,
            vectors: vectors,
            winners: winners,
          ),
        );
      });

  Future<bool> restorePortableSnapshot(FinanceSnapshot snapshot) =>
      _serializeMutation(() async {
        if (_lastLoadedSnapshotId == snapshot.snapshotId) return false;
        _state = mergePortableFinanceState(snapshot.state, _state);
        _vectors
          ..clear()
          ..addAll(snapshot.vectors);
        _winners
          ..clear()
          ..addAll(snapshot.winners);
        _advanceSequencePastKnownVectors();
        // Replay the immutable folder log against the snapshot. Vector clocks
        // make operations already covered by the snapshot harmless no-ops.
        _appliedOperations.clear();
        _lastLoadedSnapshotId = snapshot.snapshotId;
        await _persist();
        _changes.add(state);
        return true;
      });

  Future<void> markSnapshotAvailable(String snapshotId) =>
      _serializeMutation(() async {
        _lastLoadedSnapshotId = snapshotId;
        await _persist();
      });

  /// Atomically adopts the folder snapshot and replays both folder and local
  /// operations. Local files are enumerated inside the mutation queue so a UI
  /// save that completed just before reconciliation cannot be overwritten.
  Future<ReconciliationResult> reconcilePortableFolder(
    FinanceSnapshot? snapshot,
    Iterable<FinanceOperation> folderOperations, {
    String? approvedCandidateHash,
  }) => _serializeMutation(() async {
    final originalState = cloneJsonMap(_state);
    final originalVectors = Map<String, VersionVector>.from(_vectors);
    final originalWinners = Map<String, String>.from(_winners);
    final originalApplied = Set<String>.from(_appliedOperations);
    final originalConflicts = _conflicts.map(cloneJsonMap).toList();
    final originalSnapshotId = _lastLoadedSnapshotId;

    if (snapshot != null && _lastLoadedSnapshotId != snapshot.snapshotId) {
      _state = mergePortableFinanceState(snapshot.state, _state);
      _vectors
        ..clear()
        ..addAll(snapshot.vectors);
      _winners
        ..clear()
        ..addAll(snapshot.winners);
      _advanceSequencePastKnownVectors();
      _appliedOperations.clear();
      _lastLoadedSnapshotId = snapshot.snapshotId;
    }

    final operations = <String, FinanceOperation>{
      for (final operation in folderOperations) operation.opId: operation,
    };
    for (final file in await localOperationFiles()) {
      try {
        final operation = await readLocalOperation(file);
        operations[operation.opId] = operation;
      } catch (_) {
        // A failed local write will be retried by its owning save operation.
      }
    }
    final ordered = operations.values.toList()
      ..sort((left, right) {
        final created = left.createdAt.compareTo(right.createdAt);
        if (created != 0) return created;
        return left.opId.compareTo(right.opId);
      });
    var newlyApplied = 0;
    for (final operation in ordered) {
      if (_appliedOperations.contains(operation.opId)) continue;
      _applyOperationToMemory(operation);
      newlyApplied++;
    }

    final assessment = SyncSafetyAssessment.compare(originalState, _state);
    if (assessment.isSuspicious &&
        approvedCandidateHash != assessment.candidateHash) {
      _state = originalState;
      _vectors
        ..clear()
        ..addAll(originalVectors);
      _winners
        ..clear()
        ..addAll(originalWinners);
      _appliedOperations
        ..clear()
        ..addAll(originalApplied);
      _conflicts
        ..clear()
        ..addAll(originalConflicts);
      _lastLoadedSnapshotId = originalSnapshotId;
      return ReconciliationResult(
        changed: false,
        newlyApplied: 0,
        candidateHash: assessment.candidateHash,
        blockedReasons: assessment.reasons,
      );
    }

    final changed =
        assessment.candidateHash !=
        FinanceDataProfile.fromState(originalState).stateHash;
    if (changed) {
      await _safetyVault.createRestorePoint(
        originalState,
        reason: 'Before Conduit sync',
      );
    }
    await _persist();
    if (changed) _changes.add(state);
    return ReconciliationResult(
      changed: changed,
      newlyApplied: newlyApplied,
      candidateHash: assessment.candidateHash,
    );
  });

  Future<List<FinanceOperation>> saveFromWeb(String serializedState) =>
      _serializeMutation(() => _saveFromWeb(serializedState));

  Future<List<FinanceOperation>> _saveFromWeb(
    String serializedState, {
    bool createSafetyBackup = true,
  }) async {
    final nextState = _decodeMap(serializedState);
    _advanceSequencePastKnownVectors();
    final portableChanged =
        contentHash(portableFinanceState(_state)) !=
        contentHash(portableFinanceState(nextState));
    if (createSafetyBackup && portableChanged) {
      await _safetyVault.createRestorePoint(
        _state,
        reason: 'Before local change',
      );
    }
    final previousUnits = projectFinanceUnits(_state);
    final nextUnits = projectFinanceUnits(nextState);
    final keys = <String>{...previousUnits.keys, ...nextUnits.keys}.toList()
      ..sort();
    final operations = <FinanceOperation>[];

    for (final key in keys) {
      final before = previousUnits[key];
      final after = nextUnits[key];
      if (before != null &&
          after != null &&
          contentHash(before) == contentHash(after)) {
        continue;
      }
      final separator = key.indexOf('/');
      final collection = key.substring(0, separator);
      final recordId = key.substring(separator + 1);
      final sequence = _nextSequence++;
      final vector = (_vectors[key] ?? VersionVector()).increment(
        deviceId,
        sequence,
      );
      final operation = FinanceOperation(
        opId: _uuid.v4(),
        deviceId: deviceId,
        deviceSequence: sequence,
        collection: collection,
        recordId: recordId,
        kind: after == null
            ? FinanceOperationKind.delete
            : FinanceOperationKind.upsert,
        vector: vector,
        createdAt: DateTime.now().toUtc(),
        payload: after == null ? null : cloneJsonMap(after),
        baseHash: before == null ? null : contentHash(before),
      );
      operations.add(operation);
      _vectors[key] = vector;
      _winners[key] = operation.opId;
      _appliedOperations.add(operation.opId);
      await _writeOperation(operation);
    }

    _state = cloneJsonMap(nextState);
    await _persist();
    if (operations.isNotEmpty) _changes.add(state);
    return operations;
  }

  Future<bool> applyRemoteOperation(FinanceOperation operation) =>
      _serializeMutation(() => _applyRemoteOperation(operation));

  Future<bool> _applyRemoteOperation(FinanceOperation operation) async {
    if (_appliedOperations.contains(operation.opId)) return false;
    final changed = _applyOperationToMemory(operation);
    await _persist();
    if (changed) _changes.add(state);
    return changed;
  }

  bool _applyOperationToMemory(FinanceOperation operation) {
    final key = operation.entityKey;
    final currentVector = _vectors[key] ?? VersionVector();
    final order = operation.vector.compare(currentVector);
    var changed = false;

    switch (order) {
      case VectorOrder.after:
        _applyPayload(operation);
        _vectors[key] = operation.vector;
        _winners[key] = operation.opId;
        changed = true;
      case VectorOrder.before:
      case VectorOrder.equal:
        break;
      case VectorOrder.concurrent:
        final currentWinner = _winners[key] ?? '';
        final incomingWins = operation.opId.compareTo(currentWinner) > 0;
        _conflicts.add({
          'entityKey': key,
          'existingOperation': currentWinner,
          'incomingOperation': operation.opId,
          'winner': incomingWins ? operation.opId : currentWinner,
          'detectedAt': DateTime.now().toUtc().toIso8601String(),
        });
        if (_conflicts.length > 500) _conflicts.removeAt(0);
        if (incomingWins) {
          _applyPayload(operation);
          changed = true;
        }
        _vectors[key] = currentVector.merge(operation.vector);
        _winners[key] = incomingWins ? operation.opId : currentWinner;
    }

    _appliedOperations.add(operation.opId);
    return changed;
  }

  void _advanceSequencePastKnownVectors() {
    var highest = 0;
    for (final vector in _vectors.values) {
      final value = vector.values[deviceId] ?? 0;
      if (value > highest) highest = value;
    }
    if (_nextSequence <= highest) _nextSequence = highest + 1;
  }

  Future<List<File>> localOperationFiles() async {
    if (!_operationDirectory.existsSync()) return const [];
    final files = await _operationDirectory
        .list()
        .where((entry) => entry is File && entry.path.endsWith('.json'))
        .cast<File>()
        .toList();
    files.sort((a, b) => a.path.compareTo(b.path));
    return files;
  }

  Future<FinanceOperation> readLocalOperation(File file) async =>
      FinanceOperation.fromJson(_decodeMap(await file.readAsString()));

  Future<void> _writeOperation(FinanceOperation operation) async {
    _operationDirectory.createSync(recursive: true);
    final sequence = operation.deviceSequence.toString().padLeft(12, '0');
    final file = File(
      p.join(_operationDirectory.path, '$sequence-${operation.opId}.json'),
    );
    await _atomicWrite(file, jsonEncode(operation.toJson()));
  }

  void _applyPayload(FinanceOperation operation) {
    final collection = operation.collection;
    if (operation.recordId == '@singleton') {
      if (operation.kind == FinanceOperationKind.delete) {
        _state.remove(collection);
        return;
      }
      if (collection == 'settings') {
        final localSettings = _state['settings'] is Map
            ? Map<String, dynamic>.from(_state['settings'] as Map)
            : <String, dynamic>{};
        localSettings.addAll(operation.payload ?? const {});
        _state['settings'] = localSettings;
      } else {
        _state[collection] = cloneJsonMap(operation.payload ?? const {});
      }
      return;
    }

    final rows = _state[collection] is List
        ? List<dynamic>.from(_state[collection] as List)
        : <dynamic>[];
    final index = rows.indexWhere(
      (row) => row is Map && row['id']?.toString() == operation.recordId,
    );
    if (operation.kind == FinanceOperationKind.delete) {
      if (index >= 0) rows.removeAt(index);
    } else if (index >= 0) {
      rows[index] = cloneJsonMap(operation.payload ?? const {});
    } else {
      rows.add(cloneJsonMap(operation.payload ?? const {}));
    }
    _state[collection] = rows;
  }

  Future<void> _persist() async {
    await _atomicWrite(
      _stateFile,
      const JsonEncoder.withIndent(' ').convert(_state),
    );
    await _atomicWrite(
      _metadataFile,
      const JsonEncoder.withIndent(' ').convert({
        'schemaVersion': _metadataVersion,
        'deviceId': deviceId,
        'nextSequence': _nextSequence,
        'vectors': _vectors.map((key, value) => MapEntry(key, value.toJson())),
        'winners': _winners,
        'appliedOperations': _appliedOperations.toList()..sort(),
        'conflicts': _conflicts,
        if (_lastLoadedSnapshotId != null)
          'lastLoadedSnapshotId': _lastLoadedSnapshotId,
      }),
    );
  }

  Future<T> _serializeMutation<T>(Future<T> Function() action) {
    final completer = Completer<T>();
    _mutationQueue = _mutationQueue.then((_) async {
      try {
        completer.complete(await action());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
  }

  Future<void> dispose() async {
    await _mutationQueue;
    await _changes.close();
  }

  static Map<String, dynamic> _decodeMap(String source) {
    final value = jsonDecode(source);
    if (value is! Map) throw const FormatException('Expected a JSON object.');
    return value.map((key, value) => MapEntry(key.toString(), value));
  }

  static Future<void> _atomicWrite(File target, String contents) async {
    target.parent.createSync(recursive: true);
    final temporary = File('${target.path}.tmp');
    await temporary.writeAsString(contents, flush: true);
    if (target.existsSync()) await target.delete();
    await temporary.rename(target.path);
  }

  static Future<void> _preserveCorruptFile(File source) async {
    if (!source.existsSync()) return;
    final stamp = DateTime.now().toUtc().microsecondsSinceEpoch;
    await source.copy('${source.path}.corrupt-$stamp');
  }
}

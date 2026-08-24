import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../model/state_projection.dart';
import 'sync_safety.dart';

class SafetyRestorePoint {
  const SafetyRestorePoint({
    required this.backupId,
    required this.createdAt,
    required this.reason,
    required this.state,
    required this.stateHash,
    required this.totalRecords,
  });

  static const schemaVersion = 1;

  final String backupId;
  final DateTime createdAt;
  final String reason;
  final Map<String, dynamic> state;
  final String stateHash;
  final int totalRecords;

  String get fileName {
    final stamp = createdAt.toUtc().microsecondsSinceEpoch.toString().padLeft(
      20,
      '0',
    );
    return '$stamp-$backupId.json';
  }

  Map<String, dynamic> toJson() => {
    'schemaVersion': schemaVersion,
    'backupId': backupId,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'reason': reason,
    'state': state,
    'stateHash': stateHash,
    'totalRecords': totalRecords,
  };

  factory SafetyRestorePoint.fromJson(Map<String, dynamic> json) {
    if (json['schemaVersion'] != schemaVersion) {
      throw const FormatException('Unsupported safety backup version.');
    }
    final backupId = json['backupId']?.toString() ?? '';
    final reason = json['reason']?.toString() ?? '';
    final rawState = json['state'];
    if (backupId.isEmpty || reason.isEmpty || rawState is! Map) {
      throw const FormatException('Safety backup is incomplete.');
    }
    final state = rawState.map((key, value) => MapEntry(key.toString(), value));
    final expectedHash = contentHash(state);
    if (json['stateHash']?.toString() != expectedHash) {
      throw const FormatException('Safety backup integrity check failed.');
    }
    final profile = FinanceDataProfile.fromState(state);
    return SafetyRestorePoint(
      backupId: backupId,
      createdAt: DateTime.parse(json['createdAt'] as String).toUtc(),
      reason: reason,
      state: state,
      stateHash: expectedHash,
      totalRecords: profile.totalRecords,
    );
  }
}

class SafetyVault {
  SafetyVault(
    this.directory, {
    DateTime Function()? now,
    String Function()? createId,
  }) : _now = now ?? DateTime.now,
       _createId = createId ?? const Uuid().v4;

  final Directory directory;
  final DateTime Function() _now;
  final String Function() _createId;

  Future<SafetyRestorePoint?> createRestorePoint(
    Map<String, dynamic> state, {
    required String reason,
  }) async {
    final portable = portableFinanceState(state);
    final profile = FinanceDataProfile.fromState(portable);
    final existing = await listRestorePoints();
    if (existing.isNotEmpty && existing.first.stateHash == profile.stateHash) {
      return existing.first;
    }

    final point = SafetyRestorePoint(
      backupId: _createId(),
      createdAt: _now().toUtc(),
      reason: reason,
      state: portable,
      stateHash: profile.stateHash,
      totalRecords: profile.totalRecords,
    );
    directory.createSync(recursive: true);
    await _atomicWrite(
      File(p.join(directory.path, point.fileName)),
      const JsonEncoder.withIndent('  ').convert(point.toJson()),
    );
    await _prune();
    return point;
  }

  Future<List<SafetyRestorePoint>> listRestorePoints() async {
    if (!directory.existsSync()) return const [];
    final points = <SafetyRestorePoint>[];
    await for (final entity in directory.list()) {
      if (entity is! File || !entity.path.endsWith('.json')) continue;
      try {
        final raw = jsonDecode(await entity.readAsString());
        if (raw is! Map) continue;
        points.add(
          SafetyRestorePoint.fromJson(
            raw.map((key, value) => MapEntry(key.toString(), value)),
          ),
        );
      } catch (_) {
        // Never delete an unreadable restore point automatically. A partially
        // damaged vault may still be recoverable with external tools.
      }
    }
    points.sort((left, right) => right.createdAt.compareTo(left.createdAt));
    return points;
  }

  Future<SafetyRestorePoint?> find(String backupId) async {
    for (final point in await listRestorePoints()) {
      if (point.backupId == backupId) return point;
    }
    return null;
  }

  Future<void> _prune() async {
    final points = await listRestorePoints();
    if (points.length <= 20) return;

    final keep = <String>{};
    keep.addAll(points.take(20).map((point) => point.backupId));

    final daily = <String>{};
    for (final point in points) {
      final date = point.createdAt.toUtc();
      final key = '${date.year}-${date.month}-${date.day}';
      if (daily.length >= 30 && !daily.contains(key)) continue;
      if (daily.add(key)) keep.add(point.backupId);
    }

    final monthly = <String>{};
    for (final point in points) {
      final date = point.createdAt.toUtc();
      final key = '${date.year}-${date.month}';
      if (monthly.length >= 12 && !monthly.contains(key)) continue;
      if (monthly.add(key)) keep.add(point.backupId);
    }

    for (final point in points) {
      if (keep.contains(point.backupId)) continue;
      final target = File(p.join(directory.path, point.fileName));
      if (target.existsSync()) await target.delete();
    }
  }

  static Future<void> _atomicWrite(File target, String contents) async {
    target.parent.createSync(recursive: true);
    final temporary = File('${target.path}.tmp');
    await temporary.writeAsString(contents, flush: true);
    if (target.existsSync()) await target.delete();
    await temporary.rename(target.path);
  }
}

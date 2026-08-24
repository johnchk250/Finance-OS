import 'state_projection.dart';
import 'version_vector.dart';

class FinanceSnapshot {
  const FinanceSnapshot({
    required this.snapshotId,
    required this.deviceId,
    required this.createdAt,
    required this.state,
    required this.vectors,
    required this.winners,
    required this.snapshotHash,
  });

  static const schemaVersion = 1;

  final String snapshotId;
  final String deviceId;
  final DateTime createdAt;
  final Map<String, dynamic> state;
  final Map<String, VersionVector> vectors;
  final Map<String, String> winners;
  final String snapshotHash;

  int get coverageScore => vectors.values.fold<int>(
    0,
    (total, vector) =>
        total + vector.values.values.fold<int>(0, (sum, value) => sum + value),
  );

  String get relativePath {
    final stamp = createdAt.toUtc().microsecondsSinceEpoch.toString().padLeft(
      20,
      '0',
    );
    return 'finance-os/snapshots/$deviceId/$stamp-$snapshotId.json';
  }

  Map<String, dynamic> toJson() => {
    'schemaVersion': schemaVersion,
    'snapshotId': snapshotId,
    'deviceId': deviceId,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'state': state,
    'vectors': vectors.map((key, value) => MapEntry(key, value.toJson())),
    'winners': winners,
    'snapshotHash': snapshotHash,
  };

  static String calculateHash({
    required Map<String, dynamic> state,
    required Map<String, VersionVector> vectors,
    required Map<String, String> winners,
  }) => contentHash({
    'state': state,
    'vectors': vectors.map((key, value) => MapEntry(key, value.toJson())),
    'winners': winners,
  });

  factory FinanceSnapshot.fromJson(Map<String, dynamic> json) {
    if (json['schemaVersion'] != schemaVersion) {
      throw const FormatException('Unsupported finance snapshot version.');
    }
    final rawState = json['state'];
    final rawVectors = json['vectors'];
    final rawWinners = json['winners'];
    if (rawState is! Map || rawVectors is! Map || rawWinners is! Map) {
      throw const FormatException('Finance snapshot is incomplete.');
    }
    final state = rawState.map((key, value) => MapEntry(key.toString(), value));
    final vectors = rawVectors.map(
      (key, value) => MapEntry(key.toString(), VersionVector.fromJson(value)),
    );
    final winners = rawWinners.map(
      (key, value) => MapEntry(key.toString(), value.toString()),
    );
    final expectedHash = calculateHash(
      state: state,
      vectors: vectors,
      winners: winners,
    );
    final suppliedHash = json['snapshotHash']?.toString();
    if (suppliedHash == null || suppliedHash != expectedHash) {
      throw const FormatException('Finance snapshot integrity check failed.');
    }
    final snapshotId = json['snapshotId']?.toString() ?? '';
    final deviceId = json['deviceId']?.toString() ?? '';
    if (snapshotId.isEmpty || deviceId.isEmpty) {
      throw const FormatException('Finance snapshot identity is missing.');
    }
    return FinanceSnapshot(
      snapshotId: snapshotId,
      deviceId: deviceId,
      createdAt: DateTime.parse(json['createdAt'] as String).toUtc(),
      state: state,
      vectors: vectors,
      winners: winners,
      snapshotHash: suppliedHash,
    );
  }
}

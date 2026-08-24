import 'dart:convert';

import '../model/state_projection.dart';

class FinanceDataProfile {
  const FinanceDataProfile({
    required this.stateHash,
    required this.encodedBytes,
    required this.totalRecords,
    required this.recordCounts,
  });

  final String stateHash;
  final int encodedBytes;
  final int totalRecords;
  final Map<String, int> recordCounts;

  factory FinanceDataProfile.fromState(Map<String, dynamic> state) {
    final portable = portableFinanceState(state);
    final counts = <String, int>{};
    for (final collection in financeCollections) {
      final value = portable[collection];
      counts[collection] = value is List ? value.length : 0;
    }
    return FinanceDataProfile(
      stateHash: contentHash(portable),
      encodedBytes: utf8.encode(stableJson(portable)).length,
      totalRecords: counts.values.fold(0, (sum, count) => sum + count),
      recordCounts: Map.unmodifiable(counts),
    );
  }

  Map<String, dynamic> toJson() => {
    'stateHash': stateHash,
    'encodedBytes': encodedBytes,
    'totalRecords': totalRecords,
    'recordCounts': recordCounts,
  };
}

class SyncSafetyAssessment {
  const SyncSafetyAssessment({
    required this.candidateHash,
    required this.reasons,
  });

  final String candidateHash;
  final List<String> reasons;

  bool get isSuspicious => reasons.isNotEmpty;

  factory SyncSafetyAssessment.compare(
    Map<String, dynamic> current,
    Map<String, dynamic> candidate,
  ) {
    final before = FinanceDataProfile.fromState(current);
    final after = FinanceDataProfile.fromState(candidate);
    final reasons = <String>[];

    if (before.totalRecords > 0 && after.totalRecords == 0) {
      reasons.add('The incoming data would remove every finance record.');
    } else {
      final removed = before.totalRecords - after.totalRecords;
      final massRemovalThreshold = _max(10, (before.totalRecords * .25).ceil());
      if (removed >= massRemovalThreshold) {
        reasons.add(
          'The incoming data would remove $removed of '
          '${before.totalRecords} records.',
        );
      }
    }

    for (final collection in financeCollections) {
      final oldCount = before.recordCounts[collection] ?? 0;
      final newCount = after.recordCounts[collection] ?? 0;
      final removed = oldCount - newCount;
      if (oldCount >= 5 &&
          removed >= 3 &&
          newCount <= (oldCount * .5).floor()) {
        reasons.add(
          'The incoming data would reduce $collection from '
          '$oldCount to $newCount records.',
        );
      }
    }

    if (before.encodedBytes >= 4096 &&
        after.encodedBytes * 2 < before.encodedBytes) {
      reasons.add(
        'The incoming finance data is less than half the current size.',
      );
    }

    return SyncSafetyAssessment(
      candidateHash: after.stateHash,
      reasons: List.unmodifiable(reasons),
    );
  }

  static int _max(int left, int right) => left > right ? left : right;
}

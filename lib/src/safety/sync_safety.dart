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

class FinanceDataDiff {
  const FinanceDataDiff({
    required this.addedCount,
    required this.updatedCount,
    required this.removedCount,
    required this.collectionSummaries,
  });

  final int addedCount;
  final int updatedCount;
  final int removedCount;
  final List<String> collectionSummaries;

  bool get isEmpty =>
      addedCount == 0 && updatedCount == 0 && removedCount == 0;

  String get summaryText {
    if (isEmpty) return 'Identical to active data';
    final parts = <String>[];
    if (addedCount > 0) parts.add('+$addedCount added');
    if (updatedCount > 0) parts.add('~$updatedCount modified');
    if (removedCount > 0) parts.add('−$removedCount removed');
    final detail = collectionSummaries.take(3).join(', ');
    return detail.isEmpty ? parts.join(' · ') : '${parts.join(' · ')} ($detail)';
  }

  /// Computes a human-readable diff from [baseline] to [target].
  /// For a restore point preview, pass `baseline: currentActiveState, target: restorePoint.state`.
  factory FinanceDataDiff.between(
    Map<String, dynamic> baseline,
    Map<String, dynamic> target,
  ) {
    var totalAdded = 0;
    var totalUpdated = 0;
    var totalRemoved = 0;
    final summaries = <String>[];

    const labels = <String, String>{
      'transactions': 'tx',
      'salary': 'salary',
      'investments': 'investments',
      'assets': 'assets',
      'liabilities': 'liabilities',
      'taxPayments': 'tax payments',
      'goals': 'goals',
      'budgets': 'budgets',
      'recurringRules': 'rules',
      'accounts': 'accounts',
      'categories': 'categories',
    };

    for (final collection in financeCollections) {
      if (collection == 'netWorthSnapshots' || collection == 'links') continue;
      final baseList = baseline[collection] is List
          ? (baseline[collection] as List)
          : const [];
      final targetList = target[collection] is List
          ? (target[collection] as List)
          : const [];
      final baseById = <String, Map<String, dynamic>>{};
      for (final item in baseList) {
        if (item is Map && item['id'] != null) {
          baseById[item['id'].toString()] =
              item.map((k, v) => MapEntry(k.toString(), v));
        }
      }
      final targetById = <String, Map<String, dynamic>>{};
      for (final item in targetList) {
        if (item is Map && item['id'] != null) {
          targetById[item['id'].toString()] =
              item.map((k, v) => MapEntry(k.toString(), v));
        }
      }

      var cAdded = 0;
      var cUpdated = 0;
      var cRemoved = 0;
      for (final entry in targetById.entries) {
        final prev = baseById[entry.key];
        if (prev == null) {
          cAdded++;
        } else if (stableJson(prev) != stableJson(entry.value)) {
          cUpdated++;
        }
      }
      for (final key in baseById.keys) {
        if (!targetById.containsKey(key)) cRemoved++;
      }

      totalAdded += cAdded;
      totalUpdated += cUpdated;
      totalRemoved += cRemoved;
      if (cAdded > 0 || cUpdated > 0 || cRemoved > 0) {
        final label = labels[collection] ?? collection;
        final delta = cAdded - cRemoved;
        if (delta != 0) {
          summaries.add('${delta > 0 ? '+' : ''}$delta $label');
        } else if (cUpdated > 0) {
          summaries.add('$cUpdated $label edited');
        }
      }
    }

    return FinanceDataDiff(
      addedCount: totalAdded,
      updatedCount: totalUpdated,
      removedCount: totalRemoved,
      collectionSummaries: summaries,
    );
  }
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

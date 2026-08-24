import 'dart:convert';

import 'package:crypto/crypto.dart';

const financeCollections = <String>[
  'categories',
  'accounts',
  'transactions',
  'salary',
  'assets',
  'liabilities',
  'investments',
  'taxPayments',
  'goals',
  'links',
  'netWorthSnapshots',
  'recurringRules',
  'budgets',
  'documents',
];

const _localSettingKeys = <String>{
  'lastSavedAt',
  'lastUpdated',
  'planningTab',
  'transactionViewTab',
  'transactionSort',
  'transactionTypeFilter',
  'transactionCategoryFilter',
  'transactionPeriodFilter',
  'expenseSort',
  'expenseCategoryFilter',
  'budgetMonth',
};

const _localTopLevelKeys = <String>{'taxSeg'};

Map<String, dynamic> cloneJsonMap(Map<String, dynamic> value) =>
    (jsonDecode(jsonEncode(value)) as Map).cast<String, dynamic>();

/// Returns the complete portable finance dataset without device-only UI state.
Map<String, dynamic> portableFinanceState(Map<String, dynamic> state) {
  final portable = cloneJsonMap(state);
  for (final key in _localTopLevelKeys) {
    portable.remove(key);
  }
  final settings = portable['settings'];
  if (settings is Map) {
    for (final key in _localSettingKeys) {
      settings.remove(key);
    }
  }
  return portable;
}

/// Applies a portable dataset while retaining this device's UI preferences.
Map<String, dynamic> mergePortableFinanceState(
  Map<String, dynamic> portable,
  Map<String, dynamic> local,
) {
  final merged = cloneJsonMap(portable);
  for (final key in _localTopLevelKeys) {
    if (local.containsKey(key)) merged[key] = local[key];
  }

  final localSettings = local['settings'];
  if (localSettings is Map) {
    final mergedSettings = merged['settings'] is Map
        ? Map<String, dynamic>.from(merged['settings'] as Map)
        : <String, dynamic>{};
    for (final key in _localSettingKeys) {
      if (localSettings.containsKey(key)) {
        mergedSettings[key] = localSettings[key];
      }
    }
    merged['settings'] = mergedSettings;
  }
  return merged;
}

Map<String, Map<String, dynamic>> projectFinanceUnits(
  Map<String, dynamic> state,
) {
  final units = <String, Map<String, dynamic>>{};
  for (final collection in financeCollections) {
    final rows = state[collection];
    if (rows is! List) continue;
    for (final raw in rows) {
      if (raw is! Map) continue;
      final record = raw.map((key, value) => MapEntry(key.toString(), value));
      final id = record['id']?.toString();
      if (id == null || id.isEmpty) continue;
      units['$collection/$id'] = record;
    }
  }

  final settings = state['settings'];
  if (settings is Map) {
    final shared = <String, dynamic>{};
    for (final entry in settings.entries) {
      final key = entry.key.toString();
      if (!_localSettingKeys.contains(key)) shared[key] = entry.value;
    }
    units['settings/@singleton'] = shared;
  }

  for (final key in const ['forecastAssumptions']) {
    final value = state[key];
    if (value is Map) {
      units['$key/@singleton'] = value.map((k, v) => MapEntry(k.toString(), v));
    }
  }

  return units;
}

String stableJson(Object? value) => jsonEncode(_canonicalize(value));

String contentHash(Object? value) =>
    sha256.convert(utf8.encode(stableJson(value))).toString();

Object? _canonicalize(Object? value) {
  if (value is Map) {
    final keys = value.keys.map((key) => key.toString()).toList()..sort();
    return <String, dynamic>{
      for (final key in keys) key: _canonicalize(value[key]),
    };
  }
  if (value is List) return value.map(_canonicalize).toList();
  return value;
}

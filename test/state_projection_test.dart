import 'package:finance_os_synced/src/model/state_projection.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('projects finance records individually and omits local UI state', () {
    final projected = projectFinanceUnits({
      'transactions': [
        {'id': 'tx-1', 'amount': 250},
        {'id': 'tx-2', 'amount': 900},
      ],
      'settings': {
        'currency': 'BDT',
        'transactionSort': 'newest',
        'lastSavedAt': 'local-only',
      },
    });

    expect(projected['transactions/tx-1']?['amount'], 250);
    expect(projected['transactions/tx-2']?['amount'], 900);
    expect(projected['settings/@singleton'], {'currency': 'BDT'});
  });

  test('stable JSON ignores object key insertion order', () {
    expect(contentHash({'b': 2, 'a': 1}), contentHash({'a': 1, 'b': 2}));
  });

  test('portable state excludes and restores device-only preferences', () {
    final local = {
      'settings': {
        'currency': 'BDT',
        'transactionSort': 'oldest',
        'lastSavedAt': 'local-time',
      },
      'taxSeg': 'details',
      'transactions': <dynamic>[],
    };

    final portable = portableFinanceState(local);
    expect(portable['settings'], {'currency': 'BDT'});
    expect(portable.containsKey('taxSeg'), isFalse);

    final restored = mergePortableFinanceState({
      'settings': {'currency': 'USD'},
      'transactions': <dynamic>[],
    }, local);
    expect(restored['settings'], {
      'currency': 'USD',
      'transactionSort': 'oldest',
      'lastSavedAt': 'local-time',
    });
    expect(restored['taxSeg'], 'details');
  });
}

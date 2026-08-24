import 'package:finance_os_synced/src/safety/sync_safety.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, dynamic> stateWithTransactions(int count) => {
    'settings': {'currency': 'BDT'},
    'transactions': [
      for (var index = 0; index < count; index++)
        {'id': 'tx-$index', 'amount': index + 1},
    ],
  };

  test('blocks a mass record deletion', () {
    final assessment = SyncSafetyAssessment.compare(
      stateWithTransactions(40),
      stateWithTransactions(5),
    );

    expect(assessment.isSuspicious, isTrue);
    expect(assessment.reasons.join(' '), contains('35 of 40 records'));
  });

  test('allows an ordinary small change', () {
    final assessment = SyncSafetyAssessment.compare(
      stateWithTransactions(40),
      stateWithTransactions(39),
    );

    expect(assessment.isSuspicious, isFalse);
  });

  test('blocks a candidate that removes every record', () {
    final assessment = SyncSafetyAssessment.compare(
      stateWithTransactions(2),
      stateWithTransactions(0),
    );

    expect(assessment.isSuspicious, isTrue);
    expect(assessment.reasons.first, contains('every finance record'));
  });
}

import 'package:finance_os_synced/src/model/finance_snapshot.dart';
import 'package:finance_os_synced/src/model/version_vector.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  FinanceSnapshot sample() {
    final state = <String, dynamic>{
      'settings': {'currency': 'BDT'},
      'transactions': [
        {'id': 'tx-1', 'amount': 500},
      ],
    };
    final vectors = {
      'transactions/tx-1': VersionVector({'pc': 4}),
    };
    final winners = {'transactions/tx-1': 'operation-4'};
    return FinanceSnapshot(
      snapshotId: 'snapshot-1',
      deviceId: 'pc',
      createdAt: DateTime.utc(2026, 8, 22),
      state: state,
      vectors: vectors,
      winners: winners,
      snapshotHash: FinanceSnapshot.calculateHash(
        state: state,
        vectors: vectors,
        winners: winners,
      ),
    );
  }

  test('round-trips a complete portable snapshot', () {
    final snapshot = sample();
    final decoded = FinanceSnapshot.fromJson(snapshot.toJson());

    expect(decoded.snapshotId, snapshot.snapshotId);
    expect(decoded.state, snapshot.state);
    expect(decoded.coverageScore, 4);
    expect(decoded.relativePath, startsWith('finance-os/snapshots/pc/'));
  });

  test('rejects a snapshot whose finance state was modified', () {
    final encoded = sample().toJson();
    (encoded['state'] as Map)['transactions'] = [
      {'id': 'tx-1', 'amount': 999},
    ];

    expect(
      () => FinanceSnapshot.fromJson(encoded),
      throwsA(isA<FormatException>()),
    );
  });
}

import 'package:finance_os_synced/src/model/finance_operation.dart';
import 'package:finance_os_synced/src/model/version_vector.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  FinanceOperation sample() => FinanceOperation(
    opId: 'operation-7',
    deviceId: 'pc',
    deviceSequence: 7,
    collection: 'transactions',
    recordId: 'tx-1',
    kind: FinanceOperationKind.upsert,
    vector: VersionVector({'pc': 7}),
    createdAt: DateTime.utc(2026, 8, 23),
    payload: {'id': 'tx-1', 'amount': 500},
  );

  test('round-trips a checksummed operation', () {
    final operation = sample();
    final decoded = FinanceOperation.fromJson(operation.toJson());

    expect(decoded.opId, operation.opId);
    expect(decoded.operationHash, operation.operationHash);
    expect(decoded.relativePath, operation.relativePath);
  });

  test('rejects a modified operation payload', () {
    final encoded = sample().toJson();
    (encoded['payload'] as Map)['amount'] = 999;

    expect(
      () => FinanceOperation.fromJson(encoded),
      throwsA(isA<FormatException>()),
    );
  });

  test('accepts a structurally valid legacy operation', () {
    final encoded = sample().toJson()
      ..['schemaVersion'] = 1
      ..remove('operationHash');

    expect(FinanceOperation.fromJson(encoded).opId, 'operation-7');
  });
}

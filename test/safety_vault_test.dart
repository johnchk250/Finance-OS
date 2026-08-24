import 'dart:convert';
import 'dart:io';

import 'package:finance_os_synced/src/safety/safety_vault.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory temporary;

  setUp(() async {
    temporary = await Directory.systemTemp.createTemp('finance-safety-test-');
  });

  tearDown(() async {
    if (temporary.existsSync()) await temporary.delete(recursive: true);
  });

  test('keeps a rotating set of recent, daily, and monthly points', () async {
    var day = 0;
    var id = 0;
    final vault = SafetyVault(
      temporary,
      now: () => DateTime.utc(2026, 1, 1).add(Duration(days: day)),
      createId: () => 'backup-${id++}',
    );

    for (day = 0; day < 50; day++) {
      await vault.createRestorePoint({
        'transactions': [
          {'id': 'tx-$day', 'amount': day},
        ],
      }, reason: 'Change $day');
    }

    final points = await vault.listRestorePoints();
    expect(points.first.reason, 'Change 49');
    expect(points.length, greaterThanOrEqualTo(30));
    expect(points.length, lessThanOrEqualTo(42));
  });

  test('ignores a restore point whose contents were corrupted', () async {
    var id = 0;
    final vault = SafetyVault(temporary, createId: () => 'backup-${id++}');
    await vault.createRestorePoint({
      'transactions': [
        {'id': 'healthy', 'amount': 100},
      ],
    }, reason: 'Healthy');
    final latest =
        (await temporary.list().where((item) => item is File).first) as File;
    final raw = jsonDecode(await latest.readAsString()) as Map;
    (raw['state'] as Map)['transactions'] = [];
    await latest.writeAsString(jsonEncode(raw));

    expect(await vault.listRestorePoints(), isEmpty);
  });
}

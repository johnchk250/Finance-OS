import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:finance_os_synced/src/repository/finance_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _TestPaths extends PathProviderPlatform {
  _TestPaths(this.root);
  final String root;

  @override
  Future<String?> getApplicationSupportPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'web save persists safely without echo; restore still notifies',
    () async {
      final temporary = await Directory.systemTemp.createTemp(
        'finance-web-save-',
      );
      final oldPaths = PathProviderPlatform.instance;
      PathProviderPlatform.instance = _TestPaths(temporary.path);
      SharedPreferences.setMockInitialValues({});
      // Supplying an isolated cache avoids using personal bundled seed records.
      final support = Directory('${temporary.path}/FinanceOSSynced');
      await support.create();
      final cache = File('${support.path}/state.json');
      final initial = {
        'settings': {'currency': 'BDT'},
        'transactions': [
          {'id': 'tx', 'amount': 100},
        ],
      };
      await cache.writeAsString(jsonEncode(initial));
      FinanceRepository? repository;
      StreamSubscription<Map<String, dynamic>>? subscription;
      try {
        repository = await FinanceRepository.open();
        final baseline = (await repository.safetyRestorePoints()).first;
        final events = <Map<String, dynamic>>[];
        subscription = repository.changes.listen(events.add);
        final changed = repository.state;
        (changed['transactions'] as List).first['amount'] = 200;
        final operations = await repository.saveFromWeb(
          jsonEncode(changed),
          notifyChanges: false,
        );
        await Future<void>.delayed(Duration.zero);
        expect(operations, hasLength(1));
        expect(
          events,
          isEmpty,
          reason: 'Originating page must not render twice',
        );
        expect(jsonDecode(await cache.readAsString()), changed);
        expect(await repository.localOperationFiles(), hasLength(1));
        expect(await repository.safetyRestorePoints(), isNotEmpty);

        expect(await repository.restoreSafetyPoint(baseline.backupId), isTrue);
        await Future<void>.delayed(Duration.zero);
        expect(
          events,
          hasLength(1),
          reason: 'Genuine recovery must reach the UI',
        );
        expect((repository.state['transactions'] as List).first['amount'], 100);

        await repository.saveFromWeb(jsonEncode(changed));
        await Future<void>.delayed(Duration.zero);
        expect(
          events,
          hasLength(2),
          reason: 'Other callers retain notification',
        );
      } finally {
        await subscription?.cancel();
        await repository?.dispose();
        PathProviderPlatform.instance = oldPaths;
        await temporary.delete(recursive: true);
      }
    },
  );
}

import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'src/app.dart';
import 'src/repository/finance_repository.dart';
import 'src/sync/folder_sync_coordinator.dart';
import 'src/web/finance_asset_server.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final repository = await FinanceRepository.open();
  final sync = FolderSyncCoordinator(repository);
  await sync.start();

  final server = FinanceAssetServer();
  await server.start();

  WebViewEnvironment? webViewEnvironment;
  if (Platform.isWindows) {
    final support = await getApplicationSupportDirectory();
    webViewEnvironment = await WebViewEnvironment.create(
      settings: WebViewEnvironmentSettings(
        userDataFolder: p.join(support.path, 'FinanceOSSynced', 'WebView2'),
      ),
    );
  } else if (Platform.isAndroid) {
    await InAppWebViewController.setWebContentsDebuggingEnabled(kDebugMode);
  }

  runApp(
    FinanceOsApp(
      repository: repository,
      sync: sync,
      server: server,
      webViewEnvironment: webViewEnvironment,
    ),
  );
}

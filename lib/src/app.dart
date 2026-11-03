import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'export/export_service.dart';
import 'repository/finance_repository.dart';
import 'safety/sync_safety.dart';
import 'sync/folder_sync_coordinator.dart';
import 'web/finance_asset_server.dart';
import 'widgets/app_theme.dart';

class FinanceOsApp extends StatefulWidget {
  const FinanceOsApp({
    super.key,
    required this.repository,
    required this.sync,
    required this.server,
    required this.webViewEnvironment,
  });

  final FinanceRepository repository;
  final FolderSyncCoordinator sync;
  final FinanceAssetServer server;
  final WebViewEnvironment? webViewEnvironment;

  @override
  State<FinanceOsApp> createState() => _FinanceOsAppState();
}

class _FinanceOsAppState extends State<FinanceOsApp> {
  final ValueNotifier<ThemeMode> _themeMode = ValueNotifier(ThemeMode.system);

  @override
  void dispose() {
    _themeMode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<ThemeMode>(
    valueListenable: _themeMode,
    builder: (context, mode, _) => MaterialApp(
      title: 'Finance OS Synced',
      debugShowCheckedModeBanner: false,
      theme: financeHostTheme(brightness: Brightness.light),
      darkTheme: financeHostTheme(brightness: Brightness.dark),
      themeMode: mode,
      home: FinanceOsShell(
        repository: widget.repository,
        sync: widget.sync,
        server: widget.server,
        webViewEnvironment: widget.webViewEnvironment,
        onThemeChanged: (isDark) {
          _themeMode.value = isDark ? ThemeMode.dark : ThemeMode.light;
        },
      ),
    ),
  );
}

class FinanceOsShell extends StatefulWidget {
  const FinanceOsShell({
    super.key,
    required this.repository,
    required this.sync,
    required this.server,
    required this.webViewEnvironment,
    this.onThemeChanged,
  });

  final FinanceRepository repository;
  final FolderSyncCoordinator sync;
  final FinanceAssetServer server;
  final WebViewEnvironment? webViewEnvironment;
  final ValueChanged<bool>? onThemeChanged;

  @override
  State<FinanceOsShell> createState() => _FinanceOsShellState();
}

class _FinanceOsShellState extends State<FinanceOsShell>
    with WidgetsBindingObserver {
  InAppWebViewController? _controller;
  StreamSubscription<Map<String, dynamic>>? _stateSubscription;
  StreamSubscription<FolderSyncStatus>? _syncSubscription;
  late final ValueNotifier<FolderSyncStatus> _statusNotifier;
  late final Widget _webView;
  bool _pageReady = false;

  FolderSyncStatus get _status => _statusNotifier.value;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _statusNotifier = ValueNotifier(widget.sync.currentStatus);
    _webView = InAppWebView(
      webViewEnvironment: widget.webViewEnvironment,
      initialUrlRequest: URLRequest(url: WebUri(widget.server.uri.toString())),
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        databaseEnabled: false,
        domStorageEnabled: true,
        transparentBackground: false,
        supportZoom: false,
      ),
      onWebViewCreated: (controller) {
        _controller = controller;
        _registerHandlers(controller);
      },
      shouldOverrideUrlLoading: (controller, action) async {
        final uri = action.request.url;
        if (uri == null) return NavigationActionPolicy.CANCEL;
        return uri.host == widget.server.uri.host &&
                uri.port == widget.server.uri.port
            ? NavigationActionPolicy.ALLOW
            : NavigationActionPolicy.CANCEL;
      },
    );
    _stateSubscription = widget.repository.changes.listen(_pushStateToWeb);
    _syncSubscription = widget.sync.statuses.listen((status) {
      if (!mounted) return;
      _statusNotifier.value = status;
      _pushSyncStatusToWeb(status);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.sync.syncNow());
      _controller?.evaluateJavascript(
        source: 'window.financeNativeBridge?.onAppResume?.();',
      );
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stateSubscription?.cancel();
    _syncSubscription?.cancel();
    _statusNotifier.dispose();
    unawaited(widget.sync.dispose());
    unawaited(widget.repository.dispose());
    unawaited(widget.server.stop());
    super.dispose();
  }

  void _pushSyncStatusToWeb(FolderSyncStatus status) {
    if (!_pageReady) return;
    final payload = jsonEncode({
      'phase': status.phase.name,
      'message': status.message,
      'hasFolder': widget.sync.root != null,
      'lastSyncAt': status.lastSyncAt?.toIso8601String(),
    });
    _controller?.evaluateJavascript(
      source:
          'window.financeNativeBridge?.syncStatus(${jsonEncode(status.phase.name)}, $payload);',
    );
  }

  void _registerHandlers(InAppWebViewController controller) {
    controller
      ..addJavaScriptHandler(
        handlerName: 'loadFinanceState',
        callback: (_) => jsonEncode(widget.repository.state),
      )
      ..addJavaScriptHandler(
        handlerName: 'saveFinanceState',
        callback: (arguments) async {
          if (arguments.isEmpty || arguments.first is! String) return false;
          await widget.repository.saveFromWeb(
            arguments.first as String,
            notifyChanges: false,
          );
          unawaited(widget.sync.syncNow());
          return true;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'exportPortable',
        callback: (arguments) async {
          if (arguments.isEmpty || arguments.first is! String) return false;
          await ExportService.savePortableHtml(arguments.first as String);
          return true;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'exportJson',
        callback: (arguments) async {
          if (arguments.isEmpty || arguments.first is! String) return false;
          await ExportService.saveJson(arguments.first as String);
          return true;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'chooseSyncFolder',
        callback: (_) async {
          await _chooseFolder();
          return widget.sync.root != null;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'syncNow',
        callback: (_) async {
          if (widget.sync.root == null) {
            await _chooseFolder();
          } else if (_status.phase == FolderSyncPhase.blocked) {
            await _showSafetyCenter();
          } else {
            await widget.sync.syncNow();
          }
          return true;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'openSafetyCenter',
        callback: (_) async {
          await _showSafetyCenter();
          return true;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'syncTheme',
        callback: (arguments) {
          if (arguments.isNotEmpty) {
            final isDark = arguments.first == 'dark' || arguments.first == true;
            widget.onThemeChanged?.call(isDark);
          }
          return true;
        },
      )
      ..addJavaScriptHandler(
        handlerName: 'bridgeReady',
        callback: (_) {
          _pageReady = true;
          _pushStateToWeb(widget.repository.state);
          _pushSyncStatusToWeb(_status);
          return true;
        },
      );
  }

  Future<void> _pushStateToWeb(Map<String, dynamic> state) async {
    if (!_pageReady) return;
    await _controller?.evaluateJavascript(
      source: 'window.financeNativeBridge?.applyState(${jsonEncode(state)});',
    );
  }

  Future<void> _chooseFolder() async {
    final selected = await widget.sync.chooseFolder();
    if (!mounted || !selected) return;
    _pushSyncStatusToWeb(_status);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Conduit sync folder connected.')),
    );
  }

  Future<void> _showSafetyCenter() async {
    final restorePoints = await widget.repository.safetyRestorePoints();
    final activeState = widget.repository.state;
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Safety & restore vault'),
        content: SizedBox(
          width: 580,
          height: 450,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_status.phase == FolderSyncPhase.blocked) ...[
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      _status.message,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              Text(
                'Automatic restore points are stored only on this device, '
                'outside the Conduit folder. Each row shows how that point '
                'differs from your current data.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 12),
              Text(
                'Restore points (${restorePoints.length})',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 6),
              Expanded(
                child: restorePoints.isEmpty
                    ? const Center(
                        child: Text('No restore points have been created yet.'),
                      )
                    : ListView.separated(
                        itemCount: restorePoints.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (_, index) {
                          final point = restorePoints[index];
                          final diff = FinanceDataDiff.between(
                            activeState,
                            point.state,
                          );
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.restore, size: 20),
                            title: Text(point.reason),
                            subtitle: Text(
                              '${_formatDateTime(point.createdAt.toLocal())} · '
                              '${point.totalRecords} records · ${diff.summaryText}',
                            ),
                            trailing: TextButton(
                              onPressed: () async {
                                Navigator.of(dialogContext).pop();
                                await _confirmRestore(
                                  point.backupId,
                                  point.createdAt.toLocal(),
                                  diff.summaryText,
                                );
                              },
                              child: const Text('Restore'),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              Navigator.of(dialogContext).pop();
              await widget.repository.createManualRestorePoint();
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Restore point created.')),
              );
            },
            child: const Text('Create restore point'),
          ),
          if (widget.sync.canApprovePending)
            FilledButton.tonal(
              onPressed: () async {
                Navigator.of(dialogContext).pop();
                await _confirmBlockedSync();
              },
              child: const Text('Review and apply'),
            ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmRestore(
    String backupId,
    DateTime createdAt,
    String diffSummary,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Restore this data?'),
        content: Text(
          'Finance OS will create a backup of the current data, then restore '
          'the point from ${_formatDateTime(createdAt)}.\n\n'
          'Impact vs current state: $diffSummary\n\n'
          'The recovery will sync as new compensating changes.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Restore'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final restored = await widget.repository.restoreSafetyPoint(backupId);
    if (!restored) return;
    await widget.sync.syncNow();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Finance data restored successfully.')),
    );
  }

  Future<void> _confirmBlockedSync() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Apply quarantined sync?'),
        content: Text(
          '${_status.message}\n\nA restore point will be kept before any '
          'change. Continue only if you recognize the incoming change or are '
          'using the healthy local copy to repair the sync folder.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep blocked'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Apply once'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await widget.sync.approvePendingSync();
  }

  static String _formatDateTime(DateTime value) {
    String two(int part) => part.toString().padLeft(2, '0');
    return '${value.year}-${two(value.month)}-${two(value.day)} '
        '${two(value.hour)}:${two(value.minute)}';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(child: _webView),
  );
}

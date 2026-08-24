import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'export/export_service.dart';
import 'repository/finance_repository.dart';
import 'sync/folder_sync_coordinator.dart';
import 'web/finance_asset_server.dart';
import 'widgets/finance_logo.dart';

class FinanceOsApp extends StatelessWidget {
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
  Widget build(BuildContext context) => MaterialApp(
    title: 'Finance OS Synced',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff4f46e5),
        brightness: Brightness.dark,
      ),
      useMaterial3: true,
    ),
    home: FinanceOsShell(
      repository: repository,
      sync: sync,
      server: server,
      webViewEnvironment: webViewEnvironment,
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
  });

  final FinanceRepository repository;
  final FolderSyncCoordinator sync;
  final FinanceAssetServer server;
  final WebViewEnvironment? webViewEnvironment;

  @override
  State<FinanceOsShell> createState() => _FinanceOsShellState();
}

class _FinanceOsShellState extends State<FinanceOsShell> {
  InAppWebViewController? _controller;
  StreamSubscription<Map<String, dynamic>>? _stateSubscription;
  StreamSubscription<FolderSyncStatus>? _syncSubscription;
  FolderSyncStatus _status = const FolderSyncStatus(
    phase: FolderSyncPhase.disabled,
  );
  bool _pageReady = false;

  @override
  void initState() {
    super.initState();
    _status = widget.sync.currentStatus;
    _stateSubscription = widget.repository.changes.listen(_pushStateToWeb);
    _syncSubscription = widget.sync.statuses.listen((status) {
      if (!mounted) return;
      setState(() => _status = status);
      _controller?.evaluateJavascript(
        source:
            'window.financeNativeBridge?.syncStatus(${jsonEncode(status.phase.name)});',
      );
    });
  }

  @override
  void dispose() {
    _stateSubscription?.cancel();
    _syncSubscription?.cancel();
    unawaited(widget.sync.dispose());
    unawaited(widget.repository.dispose());
    unawaited(widget.server.stop());
    super.dispose();
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
          await widget.repository.saveFromWeb(arguments.first as String);
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
        handlerName: 'bridgeReady',
        callback: (_) {
          _pageReady = true;
          _pushStateToWeb(widget.repository.state);
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

  Future<void> _runPageFunction(String functionName) async {
    await _controller?.evaluateJavascript(source: '$functionName();');
  }

  Future<void> _chooseFolder() async {
    final selected = await widget.sync.chooseFolder();
    if (!mounted || !selected) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Conduit sync folder connected.')),
    );
  }

  Future<void> _showSafetyCenter() async {
    final restorePoints = await widget.repository.safetyRestorePoints();
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Safety & restore'),
        content: SizedBox(
          width: 560,
          height: 430,
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
                'outside the Conduit folder.',
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
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.restore, size: 20),
                            title: Text(point.reason),
                            subtitle: Text(
                              '${_formatDateTime(point.createdAt.toLocal())} · '
                              '${point.totalRecords} records',
                            ),
                            trailing: TextButton(
                              onPressed: () async {
                                Navigator.of(dialogContext).pop();
                                await _confirmRestore(
                                  point.backupId,
                                  point.createdAt.toLocal(),
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

  Future<void> _confirmRestore(String backupId, DateTime createdAt) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Restore this data?'),
        content: Text(
          'Finance OS will create a backup of the current data, then restore '
          'the point from ${_formatDateTime(createdAt)}. The recovery will '
          'sync as new compensating changes.',
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

  String get _statusLabel => switch (_status.phase) {
    FolderSyncPhase.disabled => 'Sync off',
    FolderSyncPhase.idle => 'Synced',
    FolderSyncPhase.syncing => 'Syncing…',
    FolderSyncPhase.blocked => 'Sync blocked',
    FolderSyncPhase.error => 'Sync error',
  };

  IconData get _statusIcon => switch (_status.phase) {
    FolderSyncPhase.disabled => Icons.sync_disabled,
    FolderSyncPhase.idle => Icons.cloud_done_outlined,
    FolderSyncPhase.syncing => Icons.sync,
    FolderSyncPhase.blocked => Icons.gpp_bad_outlined,
    FolderSyncPhase.error => Icons.sync_problem,
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      toolbarHeight: 48,
      titleSpacing: 12,
      title: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FinanceLogo(size: 24),
          SizedBox(width: 8),
          Text(
            'Finance OS',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
          ),
        ],
      ),
      actions: [
        TextButton.icon(
          onPressed: widget.sync.root == null
              ? _chooseFolder
              : _status.phase == FolderSyncPhase.blocked
              ? _showSafetyCenter
              : widget.sync.syncNow,
          icon: Icon(_statusIcon, size: 18),
          label: Text(_statusLabel),
        ),
        PopupMenuButton<String>(
          tooltip: 'Finance OS actions',
          onSelected: (value) async {
            switch (value) {
              case 'folder':
                await _chooseFolder();
              case 'sync':
                await widget.sync.syncNow();
              case 'html':
                await _runPageFunction('downloadPortableHtml');
              case 'json':
                await _runPageFunction('exportAll');
              case 'safety':
                await _showSafetyCenter();
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(
              value: 'folder',
              child: Text('Choose Conduit folder'),
            ),
            PopupMenuItem(value: 'sync', child: Text('Sync now')),
            PopupMenuItem(value: 'safety', child: Text('Safety & restore')),
            PopupMenuDivider(),
            PopupMenuItem(value: 'html', child: Text('Export portable HTML')),
            PopupMenuItem(value: 'json', child: Text('Export JSON backup')),
          ],
        ),
      ],
    ),
    body: InAppWebView(
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
    ),
  );
}

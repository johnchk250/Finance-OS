import 'package:flutter/material.dart';

import '../sync/folder_sync_coordinator.dart';
import 'finance_logo.dart';

class FinanceToolbar extends StatelessWidget implements PreferredSizeWidget {
  const FinanceToolbar({
    super.key,
    required this.phase,
    required this.hasSyncFolder,
    required this.chooseFolder,
    required this.syncNow,
    required this.showSafetyCenter,
    required this.exportHtml,
    required this.exportJson,
  });

  final FolderSyncPhase phase;
  final bool hasSyncFolder;
  final VoidCallback chooseFolder;
  final VoidCallback syncNow;
  final VoidCallback showSafetyCenter;
  final VoidCallback exportHtml;
  final VoidCallback exportJson;

  @override
  Size get preferredSize => const Size.fromHeight(48);

  String get _statusLabel => switch (phase) {
    FolderSyncPhase.disabled => 'Sync off',
    FolderSyncPhase.idle => 'Synced',
    FolderSyncPhase.syncing => 'Syncing…',
    FolderSyncPhase.blocked => 'Sync blocked',
    FolderSyncPhase.error => 'Sync error',
  };

  IconData get _statusIcon => switch (phase) {
    FolderSyncPhase.disabled => Icons.sync_disabled,
    FolderSyncPhase.idle => Icons.cloud_done_outlined,
    FolderSyncPhase.syncing => Icons.sync,
    FolderSyncPhase.blocked => Icons.gpp_bad_outlined,
    FolderSyncPhase.error => Icons.sync_problem,
  };

  VoidCallback get _statusAction {
    if (!hasSyncFolder) return chooseFolder;
    if (phase == FolderSyncPhase.blocked) return showSafetyCenter;
    return syncNow;
  }

  @override
  Widget build(BuildContext context) => AppBar(
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
        onPressed: _statusAction,
        icon: Icon(_statusIcon, size: 18),
        label: Text(_statusLabel),
      ),
      PopupMenuButton<String>(
        tooltip: 'Finance OS actions',
        onSelected: (value) {
          switch (value) {
            case 'folder':
              chooseFolder();
            case 'sync':
              syncNow();
            case 'html':
              exportHtml();
            case 'json':
              exportJson();
            case 'safety':
              showSafetyCenter();
          }
        },
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'folder', child: Text('Choose Conduit folder')),
          PopupMenuItem(value: 'sync', child: Text('Sync now')),
          PopupMenuItem(value: 'safety', child: Text('Safety & restore')),
          PopupMenuDivider(),
          PopupMenuItem(value: 'html', child: Text('Export portable HTML')),
          PopupMenuItem(value: 'json', child: Text('Export JSON backup')),
        ],
      ),
    ],
  );
}

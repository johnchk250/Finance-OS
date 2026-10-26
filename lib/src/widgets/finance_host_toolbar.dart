import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../sync/folder_sync_coordinator.dart';
import 'finance_toolbar.dart';

/// Keeps frequent sync-status changes scoped to the native toolbar subtree.
class FinanceHostToolbar extends StatelessWidget
    implements PreferredSizeWidget {
  const FinanceHostToolbar({
    super.key,
    required this.statusListenable,
    required this.hasSyncFolder,
    required this.chooseFolder,
    required this.syncNow,
    required this.showSafetyCenter,
    required this.exportHtml,
    required this.exportJson,
  });

  final ValueListenable<FolderSyncStatus> statusListenable;
  final bool Function() hasSyncFolder;
  final VoidCallback chooseFolder;
  final VoidCallback syncNow;
  final VoidCallback showSafetyCenter;
  final VoidCallback exportHtml;
  final VoidCallback exportJson;

  @override
  Size get preferredSize => const Size.fromHeight(48);

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder<FolderSyncStatus>(
        valueListenable: statusListenable,
        builder: (context, status, child) => FinanceToolbar(
          phase: status.phase,
          hasSyncFolder: hasSyncFolder(),
          chooseFolder: chooseFolder,
          syncNow: syncNow,
          showSafetyCenter: showSafetyCenter,
          exportHtml: exportHtml,
          exportJson: exportJson,
        ),
      );
}

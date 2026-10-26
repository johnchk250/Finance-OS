import 'package:finance_os_synced/src/sync/folder_sync_coordinator.dart';
import 'package:finance_os_synced/src/widgets/finance_toolbar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget buildToolbar({
    required FolderSyncPhase phase,
    bool hasSyncFolder = true,
    VoidCallback? chooseFolder,
    VoidCallback? syncNow,
    VoidCallback? showSafetyCenter,
    VoidCallback? exportHtml,
    VoidCallback? exportJson,
  }) => MaterialApp(
    home: Scaffold(
      appBar: FinanceToolbar(
        phase: phase,
        hasSyncFolder: hasSyncFolder,
        chooseFolder: chooseFolder ?? () {},
        syncNow: syncNow ?? () {},
        showSafetyCenter: showSafetyCenter ?? () {},
        exportHtml: exportHtml ?? () {},
        exportJson: exportJson ?? () {},
      ),
      body: const SizedBox.shrink(),
    ),
  );

  testWidgets('shows the label for every sync phase', (tester) async {
    const labels = {
      FolderSyncPhase.disabled: 'Sync off',
      FolderSyncPhase.idle: 'Synced',
      FolderSyncPhase.syncing: 'Syncing…',
      FolderSyncPhase.blocked: 'Sync blocked',
      FolderSyncPhase.error: 'Sync error',
    };

    for (final entry in labels.entries) {
      await tester.pumpWidget(buildToolbar(phase: entry.key));
      expect(find.text(entry.value), findsOneWidget);
    }
  });

  testWidgets('sync status action chooses folder when sync is not set up', (
    tester,
  ) async {
    var chooseCalls = 0;
    var syncCalls = 0;
    var safetyCalls = 0;

    await tester.pumpWidget(
      buildToolbar(
        phase: FolderSyncPhase.disabled,
        hasSyncFolder: false,
        chooseFolder: () => chooseCalls++,
        syncNow: () => syncCalls++,
        showSafetyCenter: () => safetyCalls++,
      ),
    );

    await tester.tap(find.text('Sync off'));

    expect(chooseCalls, 1);
    expect(syncCalls, 0);
    expect(safetyCalls, 0);
  });

  testWidgets('sync status action opens safety center when blocked', (
    tester,
  ) async {
    var chooseCalls = 0;
    var syncCalls = 0;
    var safetyCalls = 0;

    await tester.pumpWidget(
      buildToolbar(
        phase: FolderSyncPhase.blocked,
        chooseFolder: () => chooseCalls++,
        syncNow: () => syncCalls++,
        showSafetyCenter: () => safetyCalls++,
      ),
    );

    await tester.tap(find.text('Sync blocked'));

    expect(chooseCalls, 0);
    expect(syncCalls, 0);
    expect(safetyCalls, 1);
  });

  testWidgets('sync status action syncs when folder is connected', (
    tester,
  ) async {
    var syncCalls = 0;

    await tester.pumpWidget(
      buildToolbar(phase: FolderSyncPhase.idle, syncNow: () => syncCalls++),
    );

    await tester.tap(find.text('Synced'));

    expect(syncCalls, 1);
  });

  testWidgets('popup export portable HTML action routes to export callback', (
    tester,
  ) async {
    var exportCalls = 0;

    await tester.pumpWidget(
      buildToolbar(
        phase: FolderSyncPhase.idle,
        exportHtml: () => exportCalls++,
      ),
    );

    await tester.tap(find.byTooltip('Finance OS actions'));
    await tester.pumpAndSettle();
    expect(find.text('Export portable HTML'), findsOneWidget);

    await tester.tap(find.text('Export portable HTML'));
    await tester.pumpAndSettle();

    expect(exportCalls, 1);
  });
}

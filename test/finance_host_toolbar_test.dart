import 'package:finance_os_synced/src/sync/folder_sync_coordinator.dart';
import 'package:finance_os_synced/src/widgets/finance_host_toolbar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('status changes rebuild only the toolbar subtree', (
    tester,
  ) async {
    final status = ValueNotifier(
      const FolderSyncStatus(phase: FolderSyncPhase.syncing),
    );
    var bodyBuilds = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: FinanceHostToolbar(
            statusListenable: status,
            hasSyncFolder: () => true,
            chooseFolder: () {},
            syncNow: () {},
            showSafetyCenter: () {},
            exportHtml: () {},
            exportJson: () {},
          ),
          body: _BuildCounter(onBuild: () => bodyBuilds++),
        ),
      ),
    );

    expect(find.text('Syncing…'), findsOneWidget);
    expect(bodyBuilds, 1);

    const phases = [
      FolderSyncPhase.idle,
      FolderSyncPhase.syncing,
      FolderSyncPhase.idle,
      FolderSyncPhase.syncing,
      FolderSyncPhase.blocked,
      FolderSyncPhase.error,
      FolderSyncPhase.idle,
      FolderSyncPhase.syncing,
      FolderSyncPhase.idle,
      FolderSyncPhase.syncing,
      FolderSyncPhase.idle,
      FolderSyncPhase.syncing,
    ];
    for (final phase in phases) {
      status.value = FolderSyncStatus(phase: phase);
      await tester.pump();
      expect(bodyBuilds, 1);
    }

    expect(find.text('Syncing…'), findsOneWidget);
    expect(bodyBuilds, 1);

    await tester.pumpWidget(const SizedBox.shrink());
    status.dispose();
  });
}

class _BuildCounter extends StatelessWidget {
  const _BuildCounter({required this.onBuild});

  final VoidCallback onBuild;

  @override
  Widget build(BuildContext context) {
    onBuild();
    return const SizedBox.expand();
  }
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:finance_os_synced/src/widgets/finance_logo.dart';
import '../tool/generate_icons.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Finance Logo & Source Icon Generation', () {
    testWidgets('renders FinanceLogo widget in widget tree',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: FinanceLogo(size: 48),
            ),
          ),
        ),
      );

      expect(find.byType(FinanceLogo), findsOneWidget);
      expect(find.byType(CustomPaint), findsWidgets);
    });

    test('generates all platform icons and master assets from source', () async {
      await generateAllIcons(projectRoot: '.');

      // Verify Android icons
      final androidFolders = [
        'mipmap-mdpi',
        'mipmap-hdpi',
        'mipmap-xhdpi',
        'mipmap-xxhdpi',
        'mipmap-xxxhdpi',
      ];

      for (final folder in androidFolders) {
        final path = 'android/app/src/main/res/$folder/ic_launcher.png';
        final file = File(path);
        expect(file.existsSync(), isTrue, reason: '$path should exist');
        final bytes = file.readAsBytesSync();
        expect(bytes.length, greaterThan(100));
        // Check PNG magic bytes
        expect(bytes.sublist(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
      }

      // Verify Windows ICO
      final icoPath = 'windows/runner/resources/app_icon.ico';
      final icoFile = File(icoPath);
      expect(icoFile.existsSync(), isTrue, reason: '$icoPath should exist');
      final icoBytes = icoFile.readAsBytesSync();
      expect(icoBytes.length, greaterThan(500));
      // Check ICO magic bytes (0, 0, 1, 0)
      expect(icoBytes.sublist(0, 4), [0, 0, 1, 0]);

      // Verify Master PNG
      final masterPath = 'assets/images/finance_logo.png';
      final masterFile = File(masterPath);
      expect(masterFile.existsSync(), isTrue, reason: '$masterPath should exist');
      final masterBytes = masterFile.readAsBytesSync();
      expect(masterBytes.length, greaterThan(1000));
      expect(masterBytes.sublist(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
    });
  });
}

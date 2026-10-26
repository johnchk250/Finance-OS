import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../tool/build_portal.dart';

void main() {
  test('portal is self-contained, deterministic and script-safe', () {
    final seed = {
      'settings': {'owner': '</script><script>unsafe()</script>{{STYLES}}'},
      'transactions': <Object>[],
    };
    final html = buildPortal(source: Directory('portal'), seed: seed);
    expect(html, buildPortal(source: Directory('portal'), seed: seed));
    expect(html, isNot(contains('{{APPLICATION}}')));
    expect(html, isNot(contains('<script src=')));
    expect(html, isNot(contains('<link rel="stylesheet"')));
    expect(html, isNot(contains('<script>unsafe()')));
    final embedded = RegExp(
      r'<script id="embeddedState" type="application/json">([\s\S]*?)</script>',
    ).firstMatch(html)!.group(1)!;
    expect(jsonDecode(embedded), seed);
    expect(RegExp('id="financeNativeBridge"').allMatches(html), hasLength(1));
    expect(html, contains('function getCleanPortableHtml()'));
    expect(html, contains('function initializeWorkspace()'));
  });

  test('source shell contains one instance of each integration target', () {
    final html = buildPortal(source: Directory('portal'), seed: {});
    for (final id in [
      'nav',
      'mobileNav',
      'view',
      'drawer',
      'drawerBody',
      'globalSearch',
      'savePortableBtn',
      'overwriteFileBtn',
      'periodBadge',
      'moduleMenu',
    ]) {
      expect(RegExp('id="$id"').allMatches(html), hasLength(1), reason: id);
    }
  });
}

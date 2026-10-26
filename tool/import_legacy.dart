import 'dart:convert';
import 'dart:io';

import 'build_portal.dart';

/// Imports records from a legacy or portable export. The maintained portal/
/// sources supply the UI and calculations; imported scripts are not executed.
void main(List<String> args) {
  if (args.length != 2) {
    stderr.writeln(
      'Usage: dart run tool/import_legacy.dart <portable-html> <asset-dir>',
    );
    exitCode = 64;
    return;
  }
  final source = File(args[0]);
  if (!source.existsSync()) {
    stderr.writeln('Portable HTML not found: ${source.path}');
    exitCode = 66;
    return;
  }
  final raw = source.readAsStringSync();
  final embedded = RegExp(
    r'<script id="embeddedState" type="application/json">([\s\S]*?)</script>',
  ).firstMatch(raw);
  if (embedded == null) {
    stderr.writeln('The HTML has no embeddedState JSON block.');
    exitCode = 65;
    return;
  }
  final Object? state;
  try {
    state = jsonDecode(embedded.group(1)!);
  } on FormatException {
    stderr.writeln('embeddedState is not valid JSON.');
    exitCode = 65;
    return;
  }
  if (state is! Map<String, dynamic>) {
    stderr.writeln('embeddedState is not a JSON object.');
    exitCode = 65;
    return;
  }
  // Build before writing either output, so missing sources leave prior files intact.
  final html = buildPortal(source: Directory('portal'), seed: state);
  final outputDir = Directory(args[1])..createSync(recursive: true);
  File('${outputDir.path}/index.html').writeAsStringSync(html, flush: true);
  File('${outputDir.path}/seed_state.json').writeAsStringSync(
    const JsonEncoder.withIndent('  ').convert(state),
    flush: true,
  );
  stdout.writeln(
    'Imported records from ${source.path} -> ${outputDir.path}; '
    'rebuilt with maintained portal sources (${state.keys.length} top-level keys).',
  );
}

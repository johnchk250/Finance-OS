import 'dart:convert';
import 'dart:io';

/// Source order preserves the legacy shared scope and calculation behavior.
const portalScripts = [
  'state.js',
  'calculations.js',
  'views/render.js',
  'views/overview.js',
  'views/records.js',
  'views/investments-tax.js',
  'views/planning.js',
  'views/reports-settings.js',
  'views/shared.js',
  'forms.js',
  'navigation.js',
  'bootstrap.js',
];

String buildPortal({required Directory source, required Object seed}) {
  String read(String path) => File('${source.path}/$path').readAsStringSync();
  final replacements = {
    '{{SEED_STATE}}': const JsonEncoder.withIndent(
      '  ',
    ).convert(seed).replaceAll('<', r'\u003c'),
    '{{STYLES}}': [
      'base.css',
      'workspace.css',
    ].map((name) => read('styles/$name')).join('\n'),
    '{{APPLICATION}}': portalScripts
        .map((name) => '// Source: $name\n${read('scripts/$name')}')
        .join('\n'),
    '{{NATIVE_BRIDGE}}': read('scripts/native-bridge.js'),
  };
  final html = read('shell.html');
  for (final entry in replacements.entries) {
    if (entry.key.allMatches(html).length != 1) {
      throw FormatException('Expected exactly one ${entry.key} in shell.html');
    }
  }
  // Replace only markers in the original template. Record text may itself
  // contain marker-like strings and must never be interpreted as source.
  return html.replaceAllMapped(
    RegExp(r'\{\{(?:SEED_STATE|STYLES|APPLICATION|NATIVE_BRIDGE)\}\}'),
    (match) => replacements[match.group(0)]!,
  );
}

void main(List<String> args) {
  final demo = args.contains('--demo');
  final check = args.contains('--check');
  if (args.any((arg) => !['--demo', '--check'].contains(arg))) {
    stderr.writeln('Usage: dart run tool/build_portal.dart [--demo] [--check]');
    exitCode = 64;
    return;
  }
  final seedFile = File(
    demo ? 'portal/demo_state.json' : 'assets/finance/seed_state.json',
  );
  if (!seedFile.existsSync()) {
    stderr.writeln('Missing private seed. Import it first, or use --demo.');
    exitCode = 66;
    return;
  }
  final seed = jsonDecode(seedFile.readAsStringSync());
  if (seed is! Map<String, dynamic>) {
    throw const FormatException('Seed state must be a JSON object');
  }
  final html = buildPortal(source: Directory('portal'), seed: seed);
  final output = File(
    demo ? 'build/portal-preview/index.html' : 'assets/finance/index.html',
  );
  if (check) {
    if (!output.existsSync() || output.readAsStringSync() != html) {
      stderr.writeln('Portal is stale. Run dart run tool/build_portal.dart.');
      exitCode = 1;
      return;
    }
    stdout.writeln('Portal matches source.');
    return;
  }
  output.parent.createSync(recursive: true);
  output.writeAsStringSync(html, flush: true);
  stdout.writeln('Built ${output.path}');
}

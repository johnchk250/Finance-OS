import 'dart:convert';
import 'dart:io';

const _bridge = r'''
  <script id="financeNativeBridge">
  (() => {
    let bridgeReady = false;
    let saveTimer = null;
    let lastSent = "";

    async function callNative(name, ...args) {
      const bridge = window.flutter_inappwebview;
      if (!bridge || typeof bridge.callHandler !== "function") return null;
      return bridge.callHandler(name, ...args);
    }

    function refreshFromNative(nextState) {
      if (!nextState || typeof nextState !== "object") return;
      state = mergeDefaults(nextState);
      try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (_) {}
      renderNav();
      render();
      updateBrand();
      setTimeout(drawCharts, 0);
    }

    function queueStateSave() {
      if (!bridgeReady) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const serialized = JSON.stringify(state);
        if (serialized === lastSent) return;
        lastSent = serialized;
        await callNative("saveFinanceState", serialized);
      }, 250);
    }

    async function startBridge() {
      if (bridgeReady) return;
      bridgeReady = true;

      const nativeState = await callNative("loadFinanceState");
      if (nativeState) {
        const parsed = typeof nativeState === "string"
          ? JSON.parse(nativeState)
          : nativeState;
        refreshFromNative(parsed);
        lastSent = JSON.stringify(state);
      }

      const browserSave = save;
      save = function(...args) {
        const result = browserSave.apply(this, args);
        queueStateSave();
        return result;
      };

      downloadPortableHtml = async function() {
        await callNative("exportPortable", getCleanPortableHtml());
        historyStack = [];
        updateUndoButton();
      };

      exportAll = async function() {
        await callNative("exportJson", JSON.stringify(state, null, 2));
      };

      window.financeNativeBridge = {
        applyState(nextState) {
          const parsed = typeof nextState === "string"
            ? JSON.parse(nextState)
            : nextState;
          refreshFromNative(parsed);
          lastSent = JSON.stringify(state);
        },
        syncStatus(status) {
          document.documentElement.dataset.financeSyncStatus = status || "";
        }
      };

      await callNative("bridgeReady");
    }

    window.addEventListener("flutterInAppWebViewPlatformReady", startBridge);
    if (window.flutter_inappwebview) startBridge();
  })();
  </script>
''';

void main(List<String> args) {
  if (args.length != 2) {
    stderr.writeln(
      'Usage: dart run tool/import_legacy.dart <legacy-html> <asset-dir>',
    );
    exitCode = 64;
    return;
  }

  final source = File(args[0]);
  if (!source.existsSync()) {
    stderr.writeln('Legacy HTML not found: ${source.path}');
    exitCode = 66;
    return;
  }

  final outputDir = Directory(args[1])..createSync(recursive: true);
  final raw = source.readAsStringSync();
  final embedded = RegExp(
    r'<script id="embeddedState" type="application/json">([\s\S]*?)</script>',
  ).firstMatch(raw);
  if (embedded == null) {
    stderr.writeln('The legacy HTML has no embeddedState JSON block.');
    exitCode = 65;
    return;
  }

  final state = jsonDecode(embedded.group(1)!);
  if (state is! Map<String, dynamic>) {
    stderr.writeln('embeddedState is not a JSON object.');
    exitCode = 65;
    return;
  }

  var html = raw;
  const cloneNeedle = 'const clone = document.documentElement.cloneNode(true);';
  if (!html.contains(cloneNeedle)) {
    stderr.writeln('Portable export hook point was not found.');
    exitCode = 65;
    return;
  }
  html = html.replaceFirst(
    cloneNeedle,
    '$cloneNeedle\n      clone.querySelector("#financeNativeBridge")?.remove();',
  );
  if (!html.contains('</body>')) {
    stderr.writeln('Closing body tag was not found.');
    exitCode = 65;
    return;
  }
  html = html.replaceFirst('</body>', '$_bridge\n</body>');

  File(
    '${outputDir.path}${Platform.pathSeparator}index.html',
  ).writeAsStringSync(html, flush: true);
  File(
    '${outputDir.path}${Platform.pathSeparator}seed_state.json',
  ).writeAsStringSync(
    const JsonEncoder.withIndent('  ').convert(state),
    flush: true,
  );

  stdout.writeln(
    'Imported ${source.path} -> ${outputDir.path} '
    '(${state.keys.length} top-level keys)',
  );
}

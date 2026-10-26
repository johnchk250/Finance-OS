# Finance OS architecture and UI refresh

## Review

The native application already has useful boundaries: versioned operations and
snapshots, a repository, sync coordination, safety validation/vault, loopback
asset serving, and exports. Replacing those working layers during a visual
refresh would expand the data-loss and recovery regression surface.

The portal was the main maintenance bottleneck: a roughly 494 KB, 10,000-line
generated HTML file mixed private embedded records, styles, navigation,
financial calculations, views, form handlers, and the native bridge. Because
the generated file was correctly ignored by Git, UI fixes had no maintained,
reviewable source in this repository. The import tool also duplicated the
bridge implementation.

The shell exposed every destination in a flat list and many equally weighted
toolbar actions. Mobile navigation was an overflowing row of module names.
Search persisted across module changes, making a click appear ineffective.
The legacy drawer had no keyboard focus cycle or return-to-trigger behavior.

## Design alternatives and decision

1. A visual skin alone would be quick, but would preserve the maintenance issue.
2. A full Flutter rewrite would unify rendering, but would require rebuilding
   every finance form/chart and separately preserving standalone HTML exports.
3. A source-based portal with a refreshed shared shell preserves compatibility
   while making future feature work reviewable. This is the implemented option.

The visual direction is a quiet emerald/slate workspace: a grouped sidebar,
prominent totals, consistent surfaces, typography and control spacing, and
secondary actions inside one menu. Mobile uses four available shortcuts and
an all-modules dialog. Light, dark, print, focus, and reduced-motion styles
share the same design tokens. Existing features remain reachable.

## Implemented boundaries

```text
portal/shell.html                     accessible app structure
portal/styles/base.css               existing module styles
portal/styles/workspace.css          shared refreshed design system
portal/scripts/navigation.js         module registry and responsive navigation
portal/scripts/state.js              defaults, migrations, storage, helpers
portal/scripts/calculations.js       existing financial calculations
portal/scripts/views/                render entry point and feature views
portal/scripts/forms.js              existing forms, event handlers, export
portal/scripts/bootstrap.js          startup, theme, undo wiring
portal/scripts/native-bridge.js      single native bridge source
             |
tool/build_portal.dart + private seed JSON
             |
assets/finance/index.html            standalone generated app asset
             |
FinanceAssetServer -> WebView -> repository/sync/safety
```

The builder retains script order and one shared scope. This is a deliberate
compatibility boundary, not a claim that the old model has become independent
ES modules. Rendering now uses an explicit renderer map, and navigation has
one module registry with a tuple adapter for existing settings callers.

Native toolbar presentation now lives in `widgets/finance_toolbar.dart`, with
callback-based actions and tests for sync status, setup, blocked recovery, and
export routing. `widgets/app_theme.dart` owns the shared evergreen host palette.

Embedded JSON escapes `<` so record text cannot terminate its script element.
Exports reset transient menus, modal state, inert backgrounds and notifications.
No package/runtime dependency was added. Private seed data was not moved into
the tracked source; the checked-in preview fixture is synthetic.

## Remaining work, kept separate from this change

- The model and some view helpers still share mutable globals. A future change
  can extract a pure model API and transaction commands behind parity tests.
- Forms and undo still use legacy function wrapping and HTML-string rendering.
  Replacing that mechanism should be a behavior-focused migration per feature.
- Native `app.dart` still coordinates the bridge and recovery dialogs. Their
  extraction should preserve explicit recovery confirmations and mounted checks.
- The portal and native host have separate theme preferences; matching palettes
  do not synchronize those preferences automatically.

## Verification

- `flutter test` covers the existing snapshot/operation/safety tests.
- `flutter test test/portal_build_test.dart` covers deterministic, inline,
  script-safe output and unique integration targets.
- `flutter test test/finance_toolbar_test.dart` covers native toolbar status and
  action routing without creating a WebView or accessing real sync folders.
- `node tool/check_portal.mjs` checks script syntax, populated/empty balances,
  transfer conservation and module visibility. An optional original HTML path
  compares calculation outputs against the pre-refactor implementation.
- Browser checks cover every desktop/mobile module, navigation after search,
  drawer keyboard behavior, create/undo, theme changes, and narrow layouts
  (320, 390, 1024 and 1440 pixels) using demo data.
- `node tool/serve_portal.mjs` exposes `/checks.html`, which runs the actual
  portable serializer, verifies bridge removal/inline assets/transient cleanup,
  and reloads the export to compare net worth and navigation.

These checks do not constitute a tax-law audit or a live two-device sync test.

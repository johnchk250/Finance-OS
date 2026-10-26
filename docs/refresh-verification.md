# Refresh verification — 2026-09-16

## Scope

All browser actions used `portal/demo_state.json` on the loopback-only preview.
No actual finance records, live Conduit folder, recovery point, or live native
repository were changed during UI verification.

## Observed checks

- Final full `flutter test`: all 24 tests passed.
- Final Windows release and Android release APK builds completed successfully.
- Both private and demo generated HTML pass the builder's `--check` comparison.
- Existing Flutter suite: 17 tests passed.
- Portal build tests: 2 tests passed (deterministic inline assembly, safe JSON
  including closing-script and template-marker text, unique integration IDs).
- Native toolbar tests: 5 tests passed (five status labels and action routing).
- `flutter analyze`: no issues.
- Node checks: JavaScript syntax, empty/populated totals, transfer conservation,
  mandatory navigation destinations and disabled-module handling passed.
- Original vs extracted calculation outputs matched for the same three fixtures.
- Portable importer round trip preserved demo JSON and rebuilt identical HTML.
- Eleven modules rendered at desktop/mobile sizes. Final 320px and 1024px
  sweeps covered all eleven: no page or content-area horizontal overflow.
- 390px and 1440px layouts were inspected; Tax's four subviews were additionally
  checked at 320px. Wide data tables keep their own horizontal scroll container.
- Dark-mode Tax cards and primary controls were visually checked after contrast
  corrections. Navigation labels and count badges were checked separately.
- Searching for Groceries returned matching records; navigating to Budgets
  cleared the query and rendered Budgets.
- Opening a form focused its close button; Shift+Tab wrapped to Cancel;
  Escape closed the form and returned focus to its trigger.
- Creating a disposable BDT 125 transaction and invoking Undo removed it and
  restored the BDT 464,500 demo net worth.
- `/checks.html` executed the actual portable serializer: native bridge removed,
  assets inline, transient state reset, records embedded, and exported HTML
  reopened with identical net worth and all eleven navigation destinations.

## Limits

The in-app browser did not expose a download event for the blob export, so the
portable result was verified through the direct serializer/reload integration
page. Native save-dialog completion and physical-device interaction were not
exercised. Live two-device synchronization and tax-law correctness are outside
this UI/refactor verification; the underlying protocols/formulas were retained.

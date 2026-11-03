# AI agent handoff: updating Finance OS user data

Use this note with a full checkout of this repository when preparing a personal
Finance OS data update. The project contains private financial information in
local files, so share only the files needed for the requested change and only
through a private agent/workspace.

## Project checkpoint

- Checked on 2026-11-03: branch `main`, commit `ad60cf0` (`Update Finance OS from Finance-OS-main`). The tree was clean before this handoff document was added.
- Finance OS is a Flutter Windows/Android host around the maintained JavaScript portal in `portal/`.
- `portal/demo_state.json` is synthetic demo data. Never treat it as the user's data.
- The local `assets/finance/seed_state.json` is the private bootstrap seed and is ignored by Git. It is not included in a normal repository clone.

## Determine which data to update

Ask the user (or infer only when the supplied file makes it clear) which target they intend:

1. **Current app data:** Start from a fresh **Export JSON** backup from the device that has the latest Finance OS state. Runtime state is stored in the app's `FinanceOSSynced/state.json`; the selected Conduit folder also contains portable snapshots and operations. A repository checkout alone cannot show the current device or Conduit state.
2. **New-install seed:** Update `assets/finance/seed_state.json`. This seeds a fresh install; it does not overwrite an existing installation's saved state.
3. **Portal source/code:** Edit the maintained files under `portal/`. Do not edit the generated `assets/finance/index.html` directly.

Before changing data, save an untouched copy of the source JSON and record its filename/date. Do not use the demo fixture as a substitute. If only the project source is available, request the current JSON export or the user's specific changes; do not guess personal values.

The in-app JSON importer supports two behaviors: a full state object restores/replaces the dataset, while partial collection imports append records whose IDs are new. A partial import does not update an existing record with the same ID. For corrections, work from a full current backup and preserve all unrelated records. Make a separate backup before applying a full restore.

## Updated local seed inventory

These counts describe the updated `assets/finance/seed_state.json` in the current checkout, not necessarily the state currently loaded by the app or the latest state on another device:

| Data | Records |
| --- | ---: |
| Categories / accounts | 18 / 3 |
| Transactions / salary entries | 51 / 12 |
| Assets / liabilities | 4 / 0 |
| Investments / tax payments | 6 / 3 |
| Goals / links | 1 / 0 |
| Net-worth snapshots / recurring rules / budgets | 45 / 0 / 0 |
| Document metadata | 28 |

Transaction dates in that seed run from 2025-06-30 through 2026-06-30; salary
dates run from 2025-07-31 through 2026-06-30. Tax-payment dates run through
2026-09-29 and net-worth snapshots through 2026-07-17. Treat those dates as a
freshness cue, not proof that the live app has no newer records.

The Windows app's saved runtime file still has the pre-update record counts
(45 transactions, 3 assets, 1 tax payment, and 6 document records) and a
`lastSavedAt` marker of 2026-10-26. It was not changed when the seed was
updated. The Finance OS process was not running during inspection. The local
Conduit snapshots and operations are older; their latest artifacts are dated
2026-09-16. A newer state on another device cannot be ruled out unless it has
synced to this PC. Do not assume the seed update has already reached an
existing app installation.

## Data model and source map

The finance state is one JSON object. Main collections are `categories`,
`accounts`, `transactions`, `salary`, `assets`, `liabilities`, `investments`,
`taxPayments`, `goals`, `links`, `netWorthSnapshots`, `recurringRules`,
`budgets`, and `documents`; shared configuration is in `settings` and
`forecastAssumptions`. `taxSeg` and several settings fields are local view
preferences and are excluded from portable sync state.

Record fields vary by optional data and version. Use existing records and forms
as the concrete schema rather than assuming every listed field is mandatory.
Common identity/link fields include `id`, `accountId`, `categoryId`,
`documentId`, `linkedType`, and `linkedId`. Preserve existing IDs and references.
Keep dates in the format already used by matching records (normally
`YYYY-MM-DD`) and amounts numeric in the dataset's existing currency units.

Read these files before editing:

- `README.md` — storage, backup, sync, and build behavior.
- `docs/architecture-refresh.md` — maintained portal/native architecture.
- `portal/scripts/state.js` — defaults, migrations, normalization, local state loading.
- `portal/scripts/calculations.js` — derived financial calculations.
- `portal/scripts/forms.js` — record forms, undo, and JSON import/export behavior.
- `portal/scripts/views/records.js`, `investments-tax.js`, `planning.js`, and `reports-settings.js` — fields and presentation by area.
- `lib/src/model/state_projection.dart` — synchronized collections and device-only preferences.
- `lib/src/repository/finance_repository.dart` — persisted native state, merge, and operation creation.
- `lib/src/sync/` and `lib/src/safety/` — sync and restore protections; do not bypass these for a live app update.
- `tool/build_portal.dart` — builds generated HTML from maintained portal sources and the selected seed.

## User change-request format

Have the user fill one entry per requested change. They can omit values they do
not know; the agent must ask rather than invent them.

```yaml
request_title: "Short description"
target: current_app_data | new_install_seed | portal_code
valid_as_of: "YYYY-MM-DD"
source_file: "Export JSON filename, statement/document, or user-provided facts"
changes:
  - action: add | correct | close | delete
    collection: transactions | salary | assets | liabilities | investments | taxPayments | goals | budgets | recurringRules | documents | accounts | categories | settings
    existing_id: "Required for a correction/closure when known; otherwise leave blank"
    match_existing_record_by: "Only enough identifying detail to locate the record"
    effective_date: "YYYY-MM-DD, if applicable"
    fields_to_change:
      field_name: "new value"
    source_or_evidence: "Statement date/page, receipt, or user confirmation"
    notes: "Currency, one-off/recurring, tax year, uncertainty, etc."
```

For repeated items, provide one row per occurrence and the actual dates. State
whether a figure is gross or net, monthly or annual, and whether it is a
correction or a new transaction. For closing an asset/investment/liability,
provide the effective date and proceeds/payment if known. Do not delete history
unless the user explicitly requests deletion.

## Instructions to the AI agent

Copy/paste this after attaching the project checkout and the relevant private
JSON export/source documents:

> Work in the supplied Finance OS repository. Read `docs/ai-agent-user-data-update.md`, `README.md`, and the relevant source files before editing. The package may contain both an updated model/seed and an older app runtime state; inspect `START_HERE.md` and follow the user's stated target. Use the updated `assets/finance/seed_state.json` only when the requested target is that updated model/seed. For an existing app, require a fresh export if one is newer than the included runtime copy. Never use `portal/demo_state.json` as personal data.
>
> Apply only the changes listed in the request. Preserve unrelated records, IDs, field types, dates, links, settings, and history. For an existing-record correction, retain its ID. For a new record, check for duplicates and create a unique ID. Do not derive or invent missing financial, tax, account, or document values. Do not change formulas or tax rules as part of a data update. Ask the user about any ambiguity that could change the amount, date, record match, or tax treatment.
>
> Before returning the result, keep the untouched input backup, parse the resulting JSON, check for duplicate IDs and broken references, and compare record counts plus the requested fields against the source. State exactly which file was updated and whether it targets the live-data export or the new-install seed. Provide a concise change log and list any unresolved questions. Do not claim the user's current device has been updated unless the change was actually imported into that device.

## Applying the result

- For a data-only update, return the updated full JSON backup and a change log. The user can apply it through Finance OS **Settings → Import JSON** after exporting a fresh backup and creating/confirming a safety restore point.
- For a seed update, edit the ignored `assets/finance/seed_state.json`; then rebuild the embedded portal with `dart run tool/build_portal.dart`. This affects future fresh installs/builds, not an already initialized app.
- For portal code changes, edit `portal/` source and rebuild. Do not hand-edit generated HTML. Keep a backup of personal seed data and never commit it.
- Do not edit sync snapshots/operations by hand or claim a data-only JSON edit has synchronized to PC/phone. Use the app's restore/import and sync flows so repository operations and safety protections are preserved.

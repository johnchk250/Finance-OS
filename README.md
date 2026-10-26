# Finance OS Synced

A private Windows + Android wrapper for the existing Finance OS portal. It
keeps the original calculations and embedded records, stores complete portable
snapshots plus immutable change records in a folder that Conduit synchronizes
over your LAN. AppData contains a replaceable offline cache and an independent
rotating safety vault; it is never the only copy of the portable dataset.

No domain, public server, account, or TLS certificate is required. The portal
is served only at `127.0.0.1` inside each app; the WebView is prevented from
navigating away from that private loopback origin.

## First use

1. Install and pair Conduit on the PC and phone.
2. In Conduit, create a folder pair dedicated to Finance OS. Wait for the pair
   to show as connected.
3. Open Finance OS on each device.
4. Use **Sync off** or the menu's **Choose Conduit folder** action and select
   the local side of that same folder pair.
5. Use **Sync now** if you do not want to wait for the four-second scan.

Finance OS writes only under `finance-os/` in the selected folder. It never
modifies Conduit's configuration or sync metadata. Conduit transports the
files; Finance OS reconstructs the complete dataset from that folder.

## Data and conflicts

- On the first sync after upgrading, Finance OS automatically writes a complete
  snapshot of the currently assembled data into the selected folder.
- A clean PC or phone installation can recover the complete dataset by
  selecting that folder. Hidden AppData is not required for recovery.
- Deleting AppData removes the local cache, device preferences, remembered
  folder choice, and that device's safety vault. Select the same Conduit folder
  again to recover the primary dataset.
- Snapshots are full, readable JSON files under `finance-os/snapshots/`. They
  are immutable so Conduit never has to reconcile two edits of one large file.
- Each changed finance record becomes an immutable operation with a per-device
  version vector. This avoids the common corruption risk of syncing a live
  database or one large JSON file.
- Unrelated records merge automatically.
- Simultaneous edits to the same record resolve deterministically on both
  devices and are retained in the local conflict audit metadata.
- Device-only view/filter preferences are not synchronized.

```text
finance-os/
├── snapshots/<device>/<timestamp>-<id>.json   complete portable state
└── operations/<device>/<sequence>-<id>.json   concurrent change history
```

Conduit may continue transferring while Finance OS is closed. Finance OS
applies received changes when it is next opened; while open, it scans every
four seconds.

## Corruption protection and local safety vault

Finance OS treats synchronization and backup as separate layers:

- Every new operation has a SHA-256 content hash. Existing version 1 operations
  remain readable for backward compatibility.
- Snapshots, operation identities, paths, schemas, sizes, and checksums are
  validated before any incoming state is committed.
- Incoming changes are reconstructed in memory first. The active cache remains
  untouched until the complete candidate passes validation.
- Empty data and abnormal reductions in record counts or encoded size put sync
  into **Sync blocked** state. Nothing incoming is applied and no replacement
  snapshot is uploaded until the user reviews the warning.
- Unreadable, missing, path-mismatched, or conflicting artifacts are
  quarantined. A one-time override is available under **Safety & restore** for
  deliberate recovery work.
- A local restore point is written before every actual local data change and
  before every accepted incoming data change. A baseline is also created at
  startup.
- Restore-point retention is the union of the latest 20 changes, 30 daily
  points, and 12 monthly points. These files are stored in the device's
  application-support directory and are never placed in the Conduit folder.
- If the live AppData state file is unreadable at startup, Finance OS preserves
  the damaged file and automatically recovers from the newest valid local
  restore point.

Use the menu's **Safety & restore** screen to create a manual restore point,
inspect local restore history, restore an earlier state, or review a blocked
sync. Restoring first protects the current state and then creates compensating
operations, so the recovery can safely propagate to the other device.

The safety vault protects against synchronized corruption, but it is still on
the same physical device. Android removes it when app storage is cleared or the
app is uninstalled, and a failed PC drive can remove the Windows vault. Keep an
occasional portable HTML or JSON export on another drive for that final class
of disaster.

## Portable export

The app menu provides:

- **Export portable HTML**: one self-contained HTML file containing the current
  records, calculations, styling, and scripts. It opens directly in a browser.
- **Export JSON backup**: the current state as a readable backup.

The original portal's own save/export buttons are also routed through the
native Windows/Android save dialog. The native bridge is removed from the
portable HTML, so the exported file remains standalone.

## Project layout

```text
build_release.bat     interactive and CLI release builder for Windows and Android APK
portal/               maintained HTML shell, styles, JavaScript, synthetic demo
assets/finance/       generated standalone portal and private seed state (ignored)
lib/src/model/        snapshots, operation schema, projection, version vectors
lib/src/repository/   disposable cache and deterministic merge engine
lib/src/sync/         Conduit-folder adapters and sync coordinator
lib/src/safety/       staged validation and rotating local restore vault
lib/src/web/          loopback-only asset server
lib/src/export/       native portable HTML / JSON save dialogs
lib/src/widgets/      native Flutter UI widgets (e.g. vector FinanceLogo)
tool/                 portal builder, record importer, checks, icon generator
android/              Android app and Storage Access Framework adapter
windows/              Windows desktop runner
```

The portal source is separated into shell, design system, navigation, model,
calculations, feature views, forms, bootstrap, and native bridge. The builder
inlines those files in a fixed order so portable HTML remains fully standalone.
The JavaScript still shares the original execution scope; feature extraction
does not change financial formulas or the native persistence/sync protocol.
See [architecture review](docs/architecture-refresh.md) for decisions and limits.

## Tooling

### Import records from a legacy or portable HTML file

From the project root:

```powershell
dart run tool/import_legacy.dart `
  'C:\Users\EO005119\Desktop\Finance os portable.html' `
  'assets\finance'
```

This imports the embedded state and rebuilds with the maintained `portal/`
sources. It does not import styling or executable scripts from the input file.
Private financial records remain in ignored `assets/finance/` files. Portable
exports strip the native bridge and keep all required CSS and JavaScript inline.

### Edit and rebuild the portal

```powershell
dart run tool/build_portal.dart
dart run tool/build_portal.dart --check
```

Edit `portal/`, not the generated HTML. The release builder regenerates the
portal before each platform build. For direct `flutter run` or `flutter build`,
run the portal builder first.

For a safe preview with synthetic records (never overwrites your private seed):

```powershell
dart run tool/build_portal.dart --demo
node tool/check_portal.mjs
node tool/check_native_bridge.mjs
node tool/serve_portal.mjs
```

Open [the demo](http://127.0.0.1:43990) and
[portable integration checks](http://127.0.0.1:43990/checks.html) while the server
is running. [Rendering regression checks](http://127.0.0.1:43990/performance.html)
check navigation node stability and render counts. You can also open
`build/portal-preview/index.html` directly.
The demo is an independent browser dataset; do not choose a live sync
folder for UI testing. No npm packages are required by the builder or checks.

The workspace has grouped desktop navigation, mobile quick navigation plus
**More**, a search shortcut (`Ctrl/Cmd+K`), and a **•••** menu for portable export,
linked-file save, undo, and settings. `Escape` closes the record drawer.

### Generate app icons

To regenerate Windows multi-resolution `.ico` binaries and Android launcher mipmaps from the vector `FinanceLogo`:

```powershell
dart run tool/generate_icons.dart
```

## Develop and build

### Automated Release Builder

You can use the root `build_release.bat` script for interactive or one-line release builds:

- **Interactive menu**: double-click `build_release.bat` or run `build_release.bat` with no arguments to select between Windows, APK, or combined builds.
- **Direct CLI commands**:
  - `build_release.bat windows` (or `win`) — build Windows release binary
  - `build_release.bat apk` (or `android`) — build Android release APK
  - `build_release.bat all` (or `both`) — build both targets
  - `build_release.bat clean` — run clean and resolve dependencies

### Manual Flutter Commands

```powershell
flutter pub get
dart run tool/build_portal.dart
flutter analyze
flutter test
flutter build windows --release
flutter build apk --release
```

### Build Artifact Locations

- **Windows Desktop Release**: `build\windows\x64\runner\Release\`
- **Android Release APK**: `build\app\outputs\flutter-apk\app-release.apk`

### Platform Requirements & Notes

- **Windows**: Requires Microsoft Edge WebView2 runtime (pre-installed on modern Windows 10/11). The vendored `third_party/flutter_inappwebview_windows` plugin automatically handles required NuGet dependencies at CMake configure time without needing a standalone `nuget.exe` CLI on `PATH`.
- **Android**: Currently configured with Flutter's standard release signing setup; configure a private release keystore if distributing the APK beyond personal devices.
- **Touchpad Scrolling**: The Windows target uses the patched plugin under `third_party/flutter_inappwebview_windows` to forward precision-touchpad pans as native WebView2 gestures (see `third_party/flutter_inappwebview_windows/PATCHES.md`).

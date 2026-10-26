# Desktop rendering fix — 2026-09-16

## Findings and changes

- The native save handler wrote an edit, and the repository then broadcast the
  same state to its originating WebView. `applyState` unconditionally replaced
  the page and drew charts twice. Local web saves now opt out of that echo;
  persistence, operation generation, safety backups, remote updates and restore
  notifications are retained. The bridge also ignores equivalent incoming
  states, draws only through `render`, and preserves the content scroll position.
- Every navigation rebuilt the desktop nav, mobile nav and module menu using
  `innerHTML`, replacing the currently pressed/focused button. Their nodes now
  remain mounted; only selection/counts change. Clicking the current destination
  no longer replaces the view or resets its scroll position.
- Every four-second sync scan emits syncing/idle statuses. The shell formerly
  called `setState` for both, reconstructing the WebView widget subtree.
  `FinanceHostToolbar` now listens independently, and the shell retains one
  WebView widget instance. This removes unnecessary Flutter rebuild work; it is
  not evidence that the old code reloaded the web document on each scan.
- Backdrop blur on the header/mobile chrome and modal overlays added composition
  work in the texture-backed Windows WebView. These surfaces now use simple
  fills. Resize chart redraws coalesce into one animation frame; undo no longer
  makes an extra chart pass.
- A failed native save previously set `lastSent` before acknowledgement, so an
  identical retry could be skipped. It now marks success only after native
  acknowledgement and retries pending changes serially.

## Verification

- Full Flutter suite: 26 tests passed; analyzer clean.
- Repository integration test: local save persists the state and an operation
  without a UI echo; restoring an earlier state still publishes a change.
- Host widget test: twelve status changes leave the content build count at one.
- `node tool/check_native_bridge.mjs`: duplicate/reordered-state suppression,
  genuine incoming updates and restoration, single chart pass, scroll retention,
  and retry after rejected save all passed.
- `node tool/check_portal.mjs`: syntax and calculation checks passed.
- `/performance.html` on the loopback demo server: thirty module switches retain
  navigation nodes and produce exactly thirty renders/chart passes; clicking the
  active destination preserves both content nodes and scroll. One local demo
  sample measured 11.4 ms median / 79.4 ms maximum synchronous navigation work.
  These are browser-demo observations, not native frame-rate measurements.

The existing desktop app was inspected, but desktop interaction was stopped by
the user's Escape key. The user then closed it to allow rebuilding. Smoothness
in the updated native app still needs direct user confirmation; the checks above
verify the redundant work and redraw regressions rather than claiming a measured
native FPS improvement. Financial records and the sync protocol were not reset.

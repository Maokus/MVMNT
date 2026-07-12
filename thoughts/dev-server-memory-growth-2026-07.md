# Dev Server Memory Growth Investigation

**Status:** Cause identified as dev-server process RSS growth under repeated Vite reloads.

**Date:** 2026-07-12

## Summary

The first suspected cause was that `startDevPluginWatcher()` might leak `EventSource` connections across Vite Fast Refresh. Chrome DevTools MCP heap snapshots did not support that: after repeated dev-plugin rebuilds and Vite reloads, the selected page still retained one `EventSource`, one Vite `WebSocket`, and essentially the same live JS heap shape.

The memory growth observed during verification was in the Vite dev-server process, not in the selected browser page heap and not in the standalone dev-plugin process.

## Verified Results

Chrome/page heap test:

- Baseline selected-page heap: about 42 MB used.
- After 20 plugin-source edits/reloads: about 22 MB used.
- Heap snapshots stayed effectively flat:
  - Baseline: 182,852 nodes, 15 MB snapshot file.
  - After 20 reloads: 182,982 nodes, 15 MB snapshot file.
  - Both snapshots retained one native `EventSource`, one native Vite `WebSocket`, and the same `JSArrayBufferData` size.

Process RSS test:

- Fresh Vite process before plugin-source stress: about 443 MB RSS.
- After 100 `src/plugins/testplugin/my-first-element.ts` touches: about 623 MB RSS.
- Standalone `npm run dev-plugin` process stayed flat at about 78 MB RSS.
- Chrome network process stayed roughly flat, around 83 MB RSS.
- Fresh Vite process before normal app-source stress: about 430 MB RSS.
- After 100 `src/app/index.tsx` touches: about 635 MB RSS.

This means the RSS climb is reproducible with repeated Vite full-page reloads in general, not specifically with MVMNT plugin hot reload or the dev-plugin SSE watcher.

## Notes

Test setup:

- Started `npm run dev -- --host 127.0.0.1`.
- Started `npm run dev-plugin src/plugins/testplugin`.
- Opened `http://127.0.0.1:5173/` through Chrome DevTools MCP.
- Checked TCP connections to port `7741` with `lsof`.
- Touched `src/plugins/testplugin/my-first-element.ts` five times.
- Touched `src/app/index.tsx` once to invalidate the startup module.

Conclusion: if a user reports memory gradually climbing while running the dev server, the measured culprit is the Vite Node process growing during repeated reloads. This is not evidence of a retained MVMNT runtime heap leak in the browser page.

## Recommended Handling

Do not disable Vite's default file-watching behavior globally based on this result. The growth reproduced for normal app-source reloads too, so ignoring `src/plugins/**` would only mask one trigger path.

Practical guidance:

- Treat this as a dev-server RSS behavior unless a production build or selected-page heap snapshot shows retained browser objects.
- When investigating user reports, ask whether the observed process is the Vite `node ... vite` process, a browser renderer, or the production app.
- If dev-server RSS becomes operationally annoying, the least surprising mitigation is to restart `npm run dev` during long edit sessions.
- If a code-level mitigation is still desired, gate it behind an explicit dev-only opt-in flag rather than changing Vite's default watch behavior for everyone.

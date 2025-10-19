# IEC Phase 1 – Default Export Audit

**Status:** Completed scan of the targeted directories (`src/export`, `src/core/timing`, `src/app`, `src/utils`).

The table below summarizes every module in scope that still declares a default export, how it is imported today, and whether tests depend on the default form. This should help plan the migration to named exports.

| File | Export Type | Consumer Usage | Tests Using Default Import |
| --- | --- | --- | --- |
| `src/app/App.tsx` | Mixed (`export function App`, `export default App`) | Default import: `src/app/index.tsx`; no named-import consumers found | None |
| `src/app/reportWebVitals.ts` | Default only (`export default reportWebVitals`) | Default import: `src/app/index.tsx` | None |
| `src/export/export-clock.ts` | Mixed (`export class ExportClock`, `export default ExportClock`) | Default imports: `src/export/video-exporter.ts`, `src/export/image-sequence-generator.ts`, `src/export/__tests__/export-timing-snapshot.test.ts`, `src/export/__tests__/video-export-timestamps.test.ts`, `src/export/av-exporter.ts`; Named import: `src/export/export-clock.test.ts` | `src/export/__tests__/export-timing-snapshot.test.ts`, `src/export/__tests__/video-export-timestamps.test.ts` |
| `src/core/timing/note-query.ts` | Mixed (multiple named exports plus `export default noteQueryApi`) | Named imports only: `src/core/timing/__tests__/note-query.test.ts`, `src/core/timing/__tests__/timeline-phase5.test.ts`, `src/core/timing/__tests__/timeline-mapping.test.ts`, `src/core/timing/__tests__/timeline-service.test.ts`; no default-import consumers located | None |
| `src/core/timing/debug-tools.ts` | Mixed (individual named exports plus `export default {...}`) | Named imports only: `src/devtools/registerWindowTools.ts`; no default-import consumers located | None |

No default exports were detected inside `src/utils`.


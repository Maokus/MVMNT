# Export Timing Determinism (Phase 7 Summary)

This project now supports deterministic export timing by snapshotting the tempo configuration at the start of an export.

## Phase 6 Verification (MIDI & Ingestion Normalization)

Status: COMPLETE

Evidence:

-   `NoteRaw` (`src/state/timelineTypes.ts`) contains only tick + (optional) beat domain fields (`startTick`, `endTick`, `durationTicks`, `startBeat`, `endBeat`, `durationBeats`). Deprecated seconds fields removed.
-   Ingestion (`src/core/midi/midi-ingest.ts`) produces canonical tick data scaled to `CANONICAL_PPQ` and derives beats for convenience.
-   Selectors (`src/state/selectors/timelineSelectors.ts`) derive timeline seconds on demand (`selectNotesInWindow`, `selectNotesForTrackSeconds`).
-   Tests (e.g. `midiIngest.normalization.test.ts`, various timeline / transport tests) confirm stable musical positions under tempo changes.

## Phase 7 Implementation (Export / Rendering Alignment)

New files / changes:

-   `src/export/export-timing-snapshot.ts`: Provides `createExportTimingSnapshot` and pure helpers for snapshot-based seconds/beats/ticks conversions.
-   `src/export/simulated-clock.ts`: Enhanced to accept an optional `timingSnapshot` and expose `ticksForFrame()` & `secondsForTick()`.
-   `src/export/video-exporter.ts` & `src/export/image-sequence-generator.ts`: Create a timing snapshot by default (`deterministicTiming: true`) and pass it to the `SimulatedClock` (can be disabled per export options).
-   `src/export/__tests__/export-timing-snapshot.test.ts`: Verifies snapshot round‑trip accuracy and immunity to live BPM changes mid-export.

### API Notes

`VideoExportOptions` and image sequence generator options now support `deterministicTiming?: boolean` (default `true`). When `true`, changing BPM or tempo map during export does not affect frame-to-tick mapping.

### Usage Example

```ts
const exporter = new VideoExporter(canvas, visualizer);
await exporter.exportVideo({ fps: 60, deterministicTiming: true });
```

To opt into live tempo changes during export:

```ts
await exporter.exportVideo({ fps: 60, deterministicTiming: false });
```

### Future Extensions

-   Optional UI toggle to choose deterministic vs live timing.
-   Snapshot of per-track tempo (future Phase 9) when implemented.
-   Persist snapshot metadata inside exported asset manifest.

---

Generated as part of the tick-domain migration plan execution (Phases 6 & 7).

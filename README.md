# MVMNT

MVMNT (pronounced Movement) is a React-based MIDI visualization application for creating social media videos from MIDI files.

### License

MVMNT is released under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this software and make it available to users, you must also provide those users access to the complete corresponding source code of your modified version under the same license. See the `LICENSE` file for details.

### Installation

```
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm i
npm run start
```

### Custom sceneElements

Elements are the things you see and can move around. They are located in `src/core/scene/elements`. They inherit from `SceneElement` in `base.ts`.

For an example of a simple sceneElement, lets look at the text element.

```
export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            <removed for brevity>
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const renderObjects: RenderObject[] = [];

        // Get properties from bindings
        const text = this.getProperty('text') as string;
        <removed>
        const textElement = new Text(0, 0, text, font, color, 'center', 'middle');
        renderObjects.push(textElement);

        return renderObjects;
    }
}
```

two important functions are defined: `getConfigSchema` tells the ui how to render controls. `_buildRenderObjects` is called by the scene builder, and returns an array of RenderObjects.

In `_buildRenderObjects`, the controls defined in `getConfigSchema` are accessed through **bindings**. You don't need to know how these work, only that you can access these settings through `this.getProperty('id')`.

### Custom TUPR animations

The /animation-test is a page made to help design animations for the time unit piano roll. These animations can be found in `src/animation/note-animations`
To make a new animation:

1. Create a new filename
2. Copy the contents of template.ts into the file
3. Rename the class
4. Uncomment registerAnimation at the bottom and fill in the details

This should add the animation such that it will be selectable from `/animation-test` and in the main app!

### Debug stuff

`vis.sceneBuilder.getElementsByType("timeUnitPianoRoll")[0].midiManager.timingManager.setTempoMap([{time:0, bpm:100}, {time:3, bpm:200}])` run in the console in the default scene adds a tempo map to the time unit piano roll.

`localStorage.setItem("VIS_DEBUG",1)` enables debug logging.

`localStorage.removeItem("mvmnt_onboarded_v1")` re-enables onboarding modal

```
window.__mvmntDebug.getTimingState()
window.__mvmntDebug.setGlobalBpm(140)
window.__mvmntDebug.setBeatsPerBar(3)
window.__mvmntDebug.setCurrentTick(960 * 4) // seek to bar 2 (PPQ 960 example)
window.__mvmntDebug.s2b(10) -> beats
window.__mvmntDebug.b2s(32) -> seconds
window.__mvmntDebug.s2bars(10) / window.__mvmntDebug.bars2s(8)
window.__mvmntDebug.getBeatGrid(0, 30)
```

### 2025-09 PPQ Unification & Bug Fixes

Previously some UI components (timeline panel & range inputs) assumed a PPQ of 960 while the core `TimingManager` and
playback clock operated at 480. This mismatch caused:

1. Scene end seconds inputs doubling (e.g. entering `20` became `40` after commit) because seconds→beats→ticks used 960 then ticks→seconds used 480.
2. A subtle one-bar jump when pausing playback due to playhead snapping interactions and mixed-domain mirroring.

Fixes implemented:

-   Introduced `CANONICAL_PPQ = 480` (`src/core/timing/ppq.ts`) and replaced hard-coded 960/480 literals in UI logic.
-   Adjusted `play()` in `timelineStore` so quantization only applies on transition into play, not on pause, preventing a bar jump.
    -   Uses floor snapping instead of round so the playhead never jumps forward (eliminates half-bar forward shift when starting playback inside a bar).
-   Added regression tests: `playbackRange.ppqConsistency.test.ts` (seconds↔ticks round trip) and `pause.noJump.test.ts`.

If you need higher resolution later, make PPQ configurable in a single place and propagate through the store + visualizer; do not reintroduce literals.

### 2025-09 Shared Timing Manager & Tick Domain Migration (Phase 2)

The application now exposes a single authoritative tempo/tempo-map source: `sharedTimingManager` (exported from `src/state/timelineStore.ts`). All UI components, selectors, and the `PlaybackClock` reference this singleton so that BPM and tempo map changes take effect immediately during playback without requiring a restart.

Key changes:

-   Removed ad-hoc `new TimingManager()` calls across UI (`TimelineRuler`, `timeline-panel` TimeIndicator, selectors) in favor of the singleton.
-   `setGlobalBpm` and `setMasterTempoMap` directly update the shared timing manager.
-   Quantized `play()` snapping emits a `timeline-play-snapped` event; the visualizer listens and aligns the `PlaybackClock` via `clock.setTick(snappedTick)` clearing fractional remainder (prevents post-start micro jumps).
-   Legacy seconds-facing store APIs now log deprecation warnings in dev and internally convert to ticks:
    -   Legacy seconds-based APIs have been removed in Phase 8. Use tick-first equivalents: `setCurrentTick`, `seekTick`, `scrubTick`, `setLoopRangeTicks`, `setTimelineViewTicks`, `setPlaybackRangeTicks` / `setPlaybackRangeExplicitTicks`.

New regression tests:

-   `playback.pause-freeze.and-bpm-change.test.ts` ensures paused transport freezes store tick while the internal clock may advance, and validates immediate BPM change impact on tick deltas.
-   Updated `timelineStore.behavior.test.ts` now seeds and asserts in tick domain (seconds only derived).

Rationale: Multiple unsynced `TimingManager` instances previously caused tempo changes not to propagate to the active playback clock, and increased complexity in tick↔seconds mirroring. Consolidation eliminates these race conditions and surfaces a single source of truth for musical time.

### 2025-09 Canonical Tick Normalization (Offset Scaling Fix)

Root Cause (fixed): Track offsets and note timing were sometimes mixed between a source MIDI PPQ (e.g. 96 or 240) and an assumed canonical PPQ (480). Offsets authored in canonical tick space were later divided by the original file's lower PPQ, inflating effective beats (e.g. 1 bar -> 5 bars when 480/96).

Implementation Changes:

-   All MIDI ingestion now normalizes note `startTick/endTick` into the canonical domain (`CANONICAL_PPQ = 480`) on load (`buildNotesFromMIDI`).
-   Cached `ticksPerQuarter` for every ingested track is forced to `CANONICAL_PPQ`; the original PPQ is no longer used for runtime math (only implicitly in scaling during ingestion).
-   Added `offset-utils.ts` helpers: `offsetTicksToBeats`, `beatsToOffsetTicks`, `offsetTicksToSeconds` for consistent conversions.
-   Selectors (`timelineSelectors`) now derive offsets strictly via canonical PPQ (removed per-track TPQ divisions).
-   A migration guard in the store subscription rescales any legacy `midiCache` entries whose `ticksPerQuarter` differs from the canonical value (dev warning emitted once per entry).
-   New regression tests: `midiIngest.normalization.test.ts` validates normalization for PPQ 96/240/480 and correct 1-bar offset shift (2s at 120 BPM).

Developer Guidance:

1. Never divide by a track-local PPQ; use `CANONICAL_PPQ` or helpers.
2. When creating synthetic notes in tests or tooling, directly author ticks in canonical space (beats \* 480).
3. If a future requirement demands variable PPQ, perform a single normalization step immediately after parsing and keep the rest of the pipeline canonical.

Benefits:

-   Eliminates bar-length inflation / shrinkage when mixing MIDI files with different PPQs.
-   Simplifies selector logic & memoization keys (no per-track PPQ dependency churn).
-   Ensures offsets, loop ranges, and content bounds operate in a single stable tick domain.

### Scene Persistence (MVP – Phase 1)

The Phase 1+ serialization system is now always enabled (feature flag removed in v0.12.x). It provides export/import and undo/redo via a snapshot ring buffer.

API Usage:

```ts
import { exportScene, importScene, createSnapshotUndoController } from 'src/persistence';
import { useTimelineStore } from 'src/state/timelineStore';

// Initialize undo controller once (e.g. app bootstrap)
const undo = createSnapshotUndoController(useTimelineStore, { maxDepth: 50 });

// Export current scene state
const result = exportScene();
if (result.ok) {
    const json = result.json; // deterministic stable JSON
    // Persist, download, share, etc.
}

// Import scene JSON
const imported = importScene(jsonStringFromDisk);
if (!imported.ok) {
    console.error('Import failed', imported.errors);
}

// Undo / Redo handlers
if (undo.canUndo()) undo.undo();
if (undo.canRedo()) undo.redo();
```

Current Scope (extended):

-   Deterministic ordering & stable JSON stringify.
-   Timeline state snapshot (tracks, ordering, transport, selection, playback/view ranges, midi cache, row height).
-   Scene elements & scene settings (fps, dimensions, padding, tempo, meter) are now included in the `scene.elements` & `scene.sceneSettings` envelope fields when the visualizer/scene builder is present.
-   Global macros (definitions & current values) serialized under `scene.macros` and restored on import & undo.
-   Undo/redo snapshots now include scene elements + macros in addition to timeline slices.
-   Fatal-only validation (structure + required keys) – advisory rules still TBD.
-   Snapshot ring buffer (debounced ~50ms, memory cap ~10MB, depth configurable up to 100).

Not Yet Included (future work):

-   Binary / large resource deduplication (images, fonts) – future `resources` section.
-   Element-level diff/patched undo (currently full snapshot JSON for simplicity & correctness).
-   Versioned schema upgrades & migration helpers (currently single schemaVersion=1 path).

Planned Next Phases:

-   Expanded validation with error codes & advisory warnings.
-   Performance profiling & metrics flag.
-   Conditional patch-based undo (memory optimization) if thresholds exceeded.
-   Resource deduplication section (`resources`) for large repeated assets.
-   Unknown element preservation & non-fatal recovery paths.
-   Persistent font/image asset embedding & hashing.
-   Macro assignment diff visualization tooling.

Rollback: Prior feature flag has been removed; to disable persistence you would need to stub the exports in `src/persistence` (no runtime flag now).

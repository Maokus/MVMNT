# Plugin API v1 (Phase 0) — Inventory + Boundary Definition

## Status
Phase 0 deliverable (audit + boundary proposal).

## Scope audited
- Plugin-facing element templates:
  - `src/core/scene/elements/_templates/midi-notes.ts`
  - `src/core/scene/elements/_templates/audio-reactive.ts`
- Built-in/default elements with direct timeline/audio reads:
  - MIDI displays:
    - `src/core/scene/elements/midi-displays/notes-played-tracker.ts`
    - `src/core/scene/elements/midi-displays/notes-playing-display.ts`
    - `src/core/scene/elements/midi-displays/chord-estimate-display.ts`
    - `src/core/scene/elements/midi-displays/moving-notes-piano-roll/moving-notes-piano-roll.ts`
    - `src/core/scene/elements/midi-displays/time-unit-piano-roll/time-unit-piano-roll.ts`
  - Audio displays:
    - `src/core/scene/elements/audio-displays/audio-waveform.ts`
    - `src/core/scene/elements/audio-displays/audio-spectrum.ts`
    - `src/core/scene/elements/audio-displays/audio-volume-meter.ts`
    - `src/core/scene/elements/audio-displays/audio-locked-oscilloscope.ts`
  - Timing display currently using timeline state directly:
    - `src/core/scene/elements/misc/time-display.ts`

## Current implicit host contract (baseline)
Current runtime exposes non-versioned internals via globals:
- `globalThis.MVMNT.state.timelineStore = useTimelineStore`
- `globalThis.MVMNT.selectors.selectNotesInWindow = selectNotesInWindow`
- Plugin loader also resolves `@core/*`, `@audio/*`, `@utils/*` to `globalThis.MVMNT.core.*`, `globalThis.MVMNT.audio.*`, `globalThis.MVMNT.utils.*`

This is the boundary to replace with a stable, versioned plugin API.

---

## Proposed public contract: `globalThis.MVMNT.plugins`

```ts
interface MvmntPluginApiV1 {
  apiVersion: '1.0.0';
  capabilities: PluginCapability[];
  timeline: TimelineApiV1;
  audio: AudioApiV1;
  timing: TimingApiV1;
  utils: UtilsApiV1;
}
```

### Capabilities (`PluginCapability`)
- `timeline.read.v1`
- `timeline.notes-window.v1`
- `timeline.tracks.read.v1`
- `audio.features.sample-time.v1`
- `audio.features.sample-range.v1`
- `timing.convert.v1`
- `utils.music.note-name.v1`

Capability rule:
- Plugins MUST check `apiVersion` major compatibility and required capabilities before use.

---

## API v1 method list (with behavior)

### `timeline`
1. `getStateSnapshot(): TimelineSnapshot`
   - Returns a read-only serializable snapshot for plugin consumption.
   - Must include transport + timeline timing fields needed by current built-ins (`globalBpm`, `beatsPerBar`, `masterTempoMap`).
   - Error behavior: returns latest known snapshot; never throws.

2. `selectNotesInWindow(args: { trackIds: string[]; startSec: number; endSec: number }): TimelineNoteEvent[]`
   - Stable wrapper over internal note-window selector.
   - Returns empty array for invalid/no tracks.
   - Never throws for missing tracks.

3. `getTrackById(trackId: string): TimelineTrackSummary | null`
   - Returns minimal stable track metadata (`id`, `type`, `enabled`, `mute`, region/offset summary).
   - Returns `null` if missing.

4. `listTracks(filter?: { type?: 'midi' | 'audio' }): TimelineTrackSummary[]`
   - Read-only track list for plugin/built-in track-aware UIs.

### `audio`
1. `sampleFeatureAtTime(args: { trackId: string | null | undefined; feature: string | AudioFeatureDescriptorInput; timeSec: number; samplingOptions?: AudioSamplingOptions | null; channelSelector?: string | number | null }): AudioFeatureSampleResult | null`
   - Canonical point-in-time sampling API.
   - Internally may route to scene feature APIs.
   - Returns `null` when unavailable/unresolved; no throw for missing feature/track.

2. `sampleFeatureRange(args: { trackId: string; featureKey: string; startTick: number; endTick: number; options?: AudioFeatureRangeOptions; analysisProfileId?: string | null }): AudioFeatureRangeSample | null`
   - Canonical range sampling API for waveform/history views.
   - Returns `null` when range cannot be sampled.

### `timing`
1. `secondsToTicks(seconds: number): number`
2. `ticksToSeconds(ticks: number): number`
3. `getTimingSnapshot(): { globalBpm: number; beatsPerBar: number; masterTempoMap: unknown[] }`
   - Conversion/snapshot methods backed by host timing manager.
   - Invalid numeric inputs should return finite fallback values (not throw).

### `utils`
1. `noteNumberToName(note: number, options?: { sharps?: boolean }): string`
   - Utility helper for note-label UIs.

---

## Inventory: currently used internal calls and v1 mapping

### A) Plugin-facing templates

| Current internal usage | Where used | Domain | Proposed public replacement | Status |
|---|---|---|---|---|
| `globalThis.MVMNT.state.timelineStore.getState()` | `_templates/midi-notes.ts` | MIDI/timeline | `timeline.getStateSnapshot()` (or direct via wrapper call) | Mapped |
| `globalThis.MVMNT.selectors.selectNotesInWindow(...)` | `_templates/midi-notes.ts` | MIDI/timeline | `timeline.selectNotesInWindow(...)` | Mapped |
| `getFeatureData(this, trackId, 'rms', time, { smoothing })` from `@audio/features/sceneApi` | `_templates/audio-reactive.ts` | Audio features | `audio.sampleFeatureAtTime({ trackId, feature: 'rms', timeSec: time, samplingOptions: { smoothing } })` | Mapped |

### B) Built-in/default elements in scope

| Current internal usage | Where used | Domain | Proposed public replacement | Status |
|---|---|---|---|---|
| `useTimelineStore.getState()` + `selectNotesInWindow(...)` | `notes-played-tracker`, `notes-playing-display`, `chord-estimate-display`, `moving-notes-piano-roll`, `time-unit-piano-roll` | MIDI/timeline | `timeline.selectNotesInWindow(...)` (plus `timeline.getStateSnapshot()` when timeline fields needed) | Mapped |
| direct read of timeline timing fields (`state.timeline.globalBpm`, `beatsPerBar`, `masterTempoMap`) | `moving-notes-piano-roll`, `time-display` | Timing | `timing.getTimingSnapshot()` | Mapped |
| `getSharedTimingManager().secondsToTicks(...)` | `audio-waveform` | Timing conversion | `timing.secondsToTicks(...)` | Mapped |
| `sampleAudioFeatureRange(state, trackId, featureKey, startTick, endTick, ...)` | `audio-waveform` | Audio range | `audio.sampleFeatureRange(...)` | Mapped |
| `getFeatureData(this, trackId, 'spectrogram'/'rms', time, opts)` | `audio-spectrum`, `audio-volume-meter` | Audio frame | `audio.sampleFeatureAtTime(...)` | Mapped |
| `sampleFeatureFrame(trackId, descriptor, time)` | `audio-locked-oscilloscope` | Audio frame | `audio.sampleFeatureAtTime({ feature: descriptor, ... })` | Mapped |

---

## Explicitly deferred / out of scope for v1

These are intentionally **not** in Plugin API v1 for Phase 0:
- Scene mutation APIs (adding/removing tracks/elements, command dispatch).
- Direct store objects/hooks (`useTimelineStore`, `useSceneStore`, plugin store internals).
- Macro sync internals (`@state/scene/macroSyncService`).
- Diagnostics/debug globals and window dev helpers.
- Plugin loader `@core/*`/`@audio/*` passthrough as a supported public contract (kept for compatibility while migrating, but treated as legacy).

---

## Compatibility policy (v1 contract rules)

- Semver for API surface: `major.minor.patch`.
- Same major (`1.x`) may only add non-breaking fields/methods/capabilities.
- Any breaking signature or behavior change requires `2.0.0` and deprecation period.
- Plugins must guard:
  - major version mismatch,
  - missing capability.

Recommended runtime guard:
```ts
const api = globalThis.MVMNT?.plugins;
if (!api) throw new Error('MVMNT Plugin API unavailable');
if (!api.apiVersion.startsWith('1.')) throw new Error(`Unsupported API version: ${api.apiVersion}`);
for (const cap of ['timeline.notes-window.v1']) {
  if (!api.capabilities.includes(cap)) throw new Error(`Missing capability: ${cap}`);
}
```

---

## What remains internal after Phase 0

Internal implementation details remain private behind adapters:
- Exact shape of timeline store state.
- Selector/store module paths (`@state/*`, `@selectors/*`).
- Audio cache internals and subscription-controller internals.
- Host app module alias topology.

This preserves freedom to refactor internals without breaking plugins.

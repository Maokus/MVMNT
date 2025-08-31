# Detailed UI Integration Plan — Timeline System + Zustand

This plan expands the previous Timeline UI plans with concrete file-level tasks, state shapes, actions/selectors, UI wiring, and a precise cleanup path. It assumes the new timeline core (Timeline, TimelineService helpers, tempo utils) is already implemented.

## Goals

-   Replace imperative timeline service usage in UI with a reactive global store (Zustand).
-   Introduce a first-class midiTrackRef property and selector UI.
-   Migrate elements incrementally, support multi-track queries, and wire transport.
-   Maintain legacy behavior behind a feature flag until all elements are migrated.

---

## Architecture snapshot (what we’ll have after this plan)

-   Global state (Zustand): timeline, tracks, transport, selection, midi cache.
-   Pure helper functions (timeline helpers): time mapping, note queries, cross-track alignment.
-   Context: VisualizerContext exposes store hooks (selectors) and helper functions; no imperative service stored here.
-   UI controls: MidiTrackSelect, Timeline Panel, transport controls bound to store.
-   Elements: use midiTrackRef and store selectors for querying notes; optional multi-track support.

---

## Phase 1 — Core reactive foundation (store + helpers)

Deliverables

-   New store: `src/state/timelineStore.ts`
    -   State shape:
        -   timeline: { id, name, masterTempoMap?, currentTimeSec: number }
        -   tracks: Record<string, TimelineTrack> and tracksOrder: string[]
        -   transport: { isPlaying: boolean, loopEnabled: boolean, loopStartSec?: number, loopEndSec?: number }
        -   selection: { selectedTrackIds: string[] }
        -   midiCache: Record<string, { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }>
    -   Actions (typed):
        -   addMidiTrack(input: { name: string; file?: File; midiData?: MIDIData; offsetSec?: number }): Promise<string>
        -   removeTrack(id: string): void
        -   updateTrack(id: string, patch: Partial<TimelineTrack>): void
        -   setTrackOffset(id: string, offsetSec: number): void
        -   setTrackRegion(id: string, start?: number, end?: number): void
        -   setTrackEnabled(id: string, enabled: boolean): void
        -   setTrackMute(id: string, mute: boolean): void; setTrackSolo(id: string, solo: boolean): void
        -   setMasterTempoMap(map?: TempoMapEntry[]): void
        -   setCurrentTimeSec(t: number): void; play(): void; pause(): void; togglePlay(): void; scrub(to: number): void
        -   selectTracks(ids: string[]): void
        -   ingestMidiToCache(id: string, data: { midiData: MIDIData; notesRaw: NoteRaw[]; ticksPerQuarter: number; tempoMap?: TempoMapEntry[] }): void
-   Selectors (memoized where heavy): `src/state/selectors/timelineSelectors.ts`
    -   selectMidiTracks(): TimelineTrack[]
    -   selectTrackById(id)
    -   selectTracksByIds(ids)
    -   selectTransport()
    -   selectTimeline()
    -   selectMidiCacheFor(id)
    -   selectNotesInWindow(args: { trackIds: string[]; startSec: number; endSec: number }): TimelineNoteEvent[]
-   Helpers (pure): `src/core/timing/timeline-helpers.ts`
    -   beatsToSecondsWithMap(map, beats): number; secondsToBeatsWithMap(map, sec): number
    -   mapTimelineToTrackSeconds(track, timelineSec): number | null
    -   trackBeatsToTimelineSeconds(track, beats): number
    -   getNotesInWindow(state, args): TimelineNoteEvent[] (uses midiCache + tracks + mapping)
    -   alignAcrossTracks(state, { fromTrackId, toTrackId, timeInFromTrack }): number
-   MIDI cache ingestion utils: `src/core/midi/midi-ingest.ts`
    -   parseAndNormalize(file|midiData) -> { midiData, notesRaw, ticksPerQuarter, tempoMap }

Integration notes

-   Prefer normalized tracks map + order array to simplify updates and list rendering.
-   Selectors that may be called often in render must be light; heavy ones (note windows) should be memoized by (trackIds,startSec,endSec) and invalidated when relevant track or midiCache changes.

Acceptance

-   Type-safe store compiles; unit tests for actions and selectors pass.
-   getNotesInWindow returns sorted, timeline-mapped notes with trackId annotations.

---

## Phase 2 — UI plumbing (context + form control)

Deliverables

-   Visualizer context: `src/context/VisualizerContext.tsx`
    -   Expose a typed hook to access store (re-export store hooks) and helpers:
        -   useTimeline(): selectTimeline
        -   useTransport(): selectTransport + action dispatchers
        -   useMidiTracks(): selectMidiTracks
        -   useNotesInWindow(args)
        -   helpers: timeline helper functions imported and re-exported for convenience
    -   Do not store mutable instances; rely on Zustand store as source of truth.
-   MidiTrackRef type: `src/shared/types/midiTrackRef.d.ts`
    -   export type MidiTrackRef = string | null
    -   Extend component/property typing to allow `{ type: 'midiTrackRef', value: MidiTrackRef }`
-   Form control: `src/ui/form/MidiTrackSelect.tsx`
    -   Props: { value: string | null; onChange: (v: string | null) => void; allowMultiple?: boolean; includeDisabled?: boolean }
    -   Options from `useMidiTracks()`; filter by type === 'midi' and, unless includeDisabled, enabled && !mute
    -   Render empty state when no tracks; show a CTA to open Timeline Panel
-   Form registry update: `src/ui/form/index.ts` (or equivalent)
    -   Register MidiTrackSelect for property type 'midiTrackRef'
-   Dev warnings via `src/utils/debug-log.ts`
    -   warnWhenNoMidiTrack(propertyPath) in editor contexts

Acceptance

-   Any schema field with `type: 'midiTrackRef'` renders the dropdown and updates value.
-   Context hooks provide stable references and do not cause unnecessary re-renders.

---

## Phase 3 — Pilot element migration

Target element

-   Choose a widely-used element (e.g., Piano Roll or Notes Played Tracker). Below, we refer to a generic PianoRoll-like element.

Deliverables

-   Element schema update (example paths under `src/core/scene/elements/<Element>/`):
    -   Add property `midiTrackId?: string | null` with editor type 'midiTrackRef'
    -   Mark old `midiFile` as deprecated in editor UI (badge + tooltip)
-   Editor component changes:
    -   Render MidiTrackSelect bound to `midiTrackId`
    -   If `VITE_UI_LEGACY_MIDI` is true and element has `midiFile`, show a prominent “Migrate to Timeline” button:
        -   On click: parse file via store action `addMidiTrack({ name, file })` then set `midiTrackId` and clear `midiFile`
        -   No silent auto-imports
-   Renderer changes:
    -   Replace direct MidiManager calls with `useNotesInWindow({ trackIds:[midiTrackId], startSec, endSec })`
    -   Respect empty/null `midiTrackId` by rendering nothing and logging a dev hint
    -   Remove per-element offset math; rely on mapped times from selectors

Acceptance

-   Pilot element renders correctly with offsets/regions applied; legacy flow can be migrated via button.
-   No regressions when no track is selected (element remains inert).

---

## Phase 4 — Timeline Management UI & transport sync

Deliverables

-   Timeline Panel: `src/ui/panels/TimelinePanel/` (composed components)
    -   TrackList: list of tracks (name, type, enabled, mute, solo), reorder by tracksOrder
    -   TrackEditorRow: inline edits for name, offsetSec (number input), regionStart/End (range), mute/solo toggles
    -   Actions: Add MIDI Track (file picker -> addMidiTrack), Remove, Duplicate, Rename
    -   Status: indicators for disabled/muted or out-of-region
-   Transport controls: `src/ui/panels/TransportControls.tsx`
    -   Bind to store: play/pause/togglePlay, scrub, loop toggles, current time display
    -   Scrubbing updates `setCurrentTimeSec` directly; play mode advances via animation frame tied to store
-   Hook for bar-aligned nudge: `src/hooks/useBarNudge.ts`
    -   Uses helper getBarAlignedWindow + store transport to jump by ±N bars

Acceptance

-   Editing a track in the panel updates renderers live.
-   Play/pause/scrub reflects across UI and renderers; loop honors region or explicit loopStart/End.

---

## Phase 5 — Multi-track support & full migration

Deliverables

-   Multi-source element pattern
    -   Elements that can merge tracks accept `midiTrackIds: string[]`
    -   Editor supports multi-select variant of MidiTrackSelect (allowMultiple)
    -   Renderer calls `useNotesInWindow({ trackIds: midiTrackIds, startSec, endSec })` and merges/sorts
-   Update remaining MIDI-based elements (note visualizers, analyzers) to use `midiTrackId` or `midiTrackIds`
-   Performance safeguards
    -   Memoize heavy queries; avoid recompute when timeline window pans by tiny deltas (snap/quantize window)
    -   Virtualize dense renders if applicable; batch updates on playhead movement

Acceptance

-   Two or more tracks with different offsets/tempos render correctly in merged views.
-   All legacy elements have migrated pathways using midiTrackRef; no direct MidiManager dependencies in render paths.

---

## Phase 6 — Deprecation removal (feature flag off)

Feature flagging

-   Introduce `VITE_UI_LEGACY_MIDI` (default true until end of Phase 4; false from Phase 5; removed after Phase 6)
    -   Add `src/shared/config/flags.ts` to read from `import.meta.env` and expose typed booleans

Back-compat removal (highlighted for deletion)

-   [Remove] Legacy element `midiFile` properties and their form controls
-   [Remove] Auto-import shim/button code paths after confirming no elements rely on midiFile (keep migration script separately if needed)
-   [Remove] Per-element MidiManager rendering calls and any global single-source adapters
-   [Remove] TimingManager re-export at old path `src/core/timing-manager.ts` once all imports updated
-   [Remove] MidiManager compatibility layer not routed through timeline helpers
-   [Remove] VisualizerContext tempo shortcuts that bypass helpers/store

Acceptance

-   Building with `VITE_UI_LEGACY_MIDI=false` yields no deprecated UI or imports; lints and tests are green.

---

## Phase 7 — Validation & testing

Deliverables

-   Unit tests
    -   `src/state/tests/timelineStore.test.ts`: actions, selectors, edge cases (mute/solo, regions, offsets)
    -   `src/core/timing/tests/timeline-helpers.test.ts`: beats/seconds, mapping, cross-track alignment
-   Integration/UI tests
    -   `src/ui/form/__tests__/MidiTrackSelect.test.tsx`
    -   `src/ui/panels/__tests__/TimelinePanel.test.tsx`
    -   Pilot element editor + renderer integration with track selection and migration
-   Smoke page
    -   Update `src/pages/AnimationTestPage.tsx` to seed two tracks with different offsets, show PianoRoll twice (single-track) and once (merged)
-   Performance and stability
    -   Profile note queries and rendering during playback; ensure <= 16ms budget typical on dev hardware

Acceptance

-   All new tests pass locally and in CI; manual smoke shows correct offsets and region clipping.

---

## File-level checklist (add/update/remove)

Add

-   src/state/timelineStore.ts — Zustand store (state/actions)
-   src/state/selectors/timelineSelectors.ts — Memoized selectors
-   src/core/timing/timeline-helpers.ts — Pure helper functions
-   src/core/midi/midi-ingest.ts — MIDI parsing/normalization interface to store
-   src/ui/form/MidiTrackSelect.tsx — Track selector control
-   src/ui/panels/TimelinePanel/\* — Timeline management UI
-   src/ui/panels/TransportControls.tsx — Transport UI bound to store
-   src/hooks/useBarNudge.ts — Bar-aligned navigation
-   src/shared/types/midiTrackRef.d.ts — Property type for track references
-   src/shared/config/flags.ts — Feature flag accessors (Vite env)

Update

-   src/context/VisualizerContext.tsx — Provide hooks to store/selectors/helpers
-   src/ui/form/index.ts — Register MidiTrackSelect for 'midiTrackRef'
-   src/pages/AnimationTestPage.tsx — Demo multi-track setup and rendering
-   MIDI-using elements under src/core/scene/elements/\*\* — Add midiTrackId/midiTrackIds and use selectors for notes

Remove (Phase 6)

-   Legacy midiFile properties and UI
-   Auto-import shim
-   Per-element MidiManager render paths and single-source adapters
-   TimingManager old-path re-export file
-   VisualizerContext tempo shortcuts bypassing the new path

---

## Edge cases & handling

-   No track selected: elements render nothing; show non-blocking dev hint via debug-log
-   Track disabled/muted: selectors exclude muted/disabled unless explicitly included
-   Region clipping: selectors clamp windows to track regions
-   Mixed tempo sources: prefer per-track tempoMap; fallback to master; then fixed tempo as last resort
-   Large files: memoize queries; avoid per-frame recompute; optional precomputation of segment maps

---

## Migration guidance & lint rules

-   Add an ESLint rule/codemod checklist to forbid imports from `src/core/timing-manager.ts` and direct MidiManager calls in UI.
-   Search-and-replace patterns with safe wrappers; run in CI to block regressions until Phase 6 completes.

---

## Timeline & milestones (suggested)

-   P1 (Store+Helpers): 1–2 days
-   P2 (Plumbing+Selector): 1 day
-   P3 (Pilot element): 1–2 days
-   P4 (Panel+Transport): 2–3 days
-   P5 (Multi-track+migration): 2–4 days
-   P6 (Removal): 0.5–1 day
-   P7 (Tests+Perf): 1–2 days

Durations are estimates and assume the core timeline system is already stable.

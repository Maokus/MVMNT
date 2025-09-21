Here's a comprehensive, phased implementation plan for adding a draggable, offsettable Web Audio–backed audio track that drives timeline time and is muxed into exported video (via MediaBunny). Each phase includes: goal, scope, key technical decisions tied to existing architecture, deliverables, and acceptance criteria.

## Phase 0 – Guiding Architectural Principles

1. Single source of temporal truth during playback: Web Audio `AudioContext.currentTime` (plus offset) becomes the authoritative wall‑clock; `PlaybackClock` adapts to derive ticks from audio time instead of `performance.now()` when audio is active.
2. Determinism for export: Continue to use `SimulatedClock` + captured timing snapshot; audio decoding/rendering for export is non-real-time (pre-mux).
3. Non-destructive integration: Maintain current `PlaybackClock` API; introduce an `IAudioTimeSource` adapter so clock can swap wall time source.
4. Latency & drift minimization: Use scheduled `AudioBufferSourceNode` start with computed offset; avoid re-starts mid play unless user seeks.
5. Scrub & paused state: While paused, audio is stopped (or context suspended) and timeline uses stored tick; on resume, derive new audio start time aligning ticks and buffer position.

---

## Phase 1 – Data Model Extension

Add audio track concept alongside MIDI tracks.

Changes:

-   Extend `TimelineTrack` union:
    -   New type: `type: 'audio'`
    -   Fields: `audioSourceId?: string`, `durationSec?: number`, `offsetTicks` (reuse), `gain?: number`, `startOffsetSec?: number`
    -   Possibly `bufferChannels?: number`, `sampleRate?: number` (metadata—optional).
-   `timelineStore` additions:
    -   `audioCache: Record<string, { audioBuffer: AudioBuffer; duration: number; sampleRate: number }>`
    -   Actions:
        -   `addAudioTrack({ name, file, offsetTicks?: number }): Promise<string>`
        -   `ingestAudioToCache(id, bufferMeta)`
        -   `setTrackGain(id, gain)`
        -   `setAudioStartOffset(id, seconds)` (drag logic writes here)
-   Content bounds computation: include audio tracks (start = `startOffsetSec` converted to ticks; end = `(startOffsetSec + durationSec)` to ticks).
-   Selectors: Add seconds<->ticks for audio based on shared timing manager.
-   Persist/serialize: If you have existing persistence, update schema/version tagging to include audio.

Acceptance Criteria:

-   Adding an audio track inserts it in `tracks` with `type: 'audio'`.
-   Store can ingest a decoded `AudioBuffer` and set `durationSec`.
-   Timeline content bounds reflect audio track presence (zoom auto-adjust).
-   No regressions in MIDI track operations.

---

## Phase 2 – Audio Engine Abstraction

Create `AudioEngine` module to manage:

-   Singleton `AudioContext`.
-   Decoding file -> `AudioBuffer`.
-   Play/stop scheduling of a buffer with arbitrary offset (both timeline anchor and user offset).
-   Gain node per track + master gain.
-   Track enable/mute/solo logic integration (reusing existing track flags).
-   Expose precise `getTransportAudioTime(): number` returning effective "playhead seconds since timeline zero" (timeline domain).

Core API (TypeScript interface):

```
interface AudioEngine {
  ensureContext(): Promise<void>;
  decodeFile(file: File): Promise<AudioBuffer>;
  registerTrackAudio(trackId: string, buffer: AudioBuffer, startOffsetSec: number): void;
  play(startAtTick: number, now?: number): void;
  pause(): void;
  stop(): void;
  seek(tick: number): void;
  setTrackGain(trackId: string, gain: number): void;
  setTrackStartOffset(trackId: string, seconds: number): void;
  getTimelineSeconds(now?: number): number; // seconds in timeline domain aligned to shared tempo
  isActive(): boolean;
}
```

Scheduling Strategy:

-   On `play`, compute timelineStartSec = ticks -> seconds for `startAtTick`.
-   For each audio track:
    -   Playback anchor = audioContext.currentTime + small lead (e.g. 0.05s) to schedule.
    -   Buffer start offset inside audio = max(0, timelineStartSec - track.startOffsetSec).
    -   If start offset inside buffer >= buffer duration -> skip (playhead beyond).
    -   `source.start(anchorTime, bufferOffset)`.
-   Maintain a structure: `activeSources: Map<trackId, AudioBufferSourceNode>` for cleanup on pause/seek.
-   On pause: stop sources & store last timelineSecs to resume mapping.
-   On seek: stop, then if playing, re-schedule quickly (debounce rapid scrubs).

Integration with existing `PlaybackClock`:

-   Introduce an optional "external wall time provider" function into `PlaybackClock.update` path:
    -   If audio engine active & transport playing: use `audioEngine.getTimelineSeconds()` to derive beats -> ticks directly (bypassing incremental dt integration) OR supply an alternate `nowMs` computed from audio timeline seconds \* 1000.
-   Alternative simpler model: Wrap existing `PlaybackClock` with an adapter that sets tick each frame from `seconds -> ticks` conversion of audio time; disable its internal dt integration while audio drives (freeze `_lastWallTimeMs` updates).
-   Add a `TransportTimeSource` enum to store: `performance` | `audio`.

Edge Cases:

-   Buffer shorter than timeline: allow silence after end (no rescheduling).
-   Rate changes (`transport.rate`): set playbackRate on each `AudioBufferSourceNode`.

Acceptance Criteria:

-   Starting transport with an audio track results in audible playback aligned with tick timeline (tested via logging tick vs audio seconds).
-   Pausing stops audio immediately (context suspend or sources stopped).
-   Seeking while paused updates "would-be" buffer offset (next play starts correctly).
-   Changing transport rate affects pitch+speed (unless time-stretch planned—out of scope now).
-   No pops on start/stop (use short fade ramp 5ms with gain node).

---

## Phase 3 – Timeline Dragging & Offset UX

Allow user to drag audio clip horizontally to set start offset.

Data Flow:

-   UI component (e.g. `AudioTrackRow`) handles pointer drag.
-   Convert delta pixels -> ticks -> seconds; update both:
    -   `setTrackOffsetTicks` (for canonical tick offset)
    -   `setAudioStartOffset(trackId, seconds)` (mirrors, but one source-of-truth—pick seconds to avoid repeated conversions; keep ticks derived)
        Recommendation: Use seconds as canonical for audio start offset; compute ticks on the fly in selectors (`audioStartOffsetTicks = secondsToTicks(startOffsetSec)`).

Snapping:

-   Reuse quantize/bar snapping (existing `quantize` setting). When quantize on, snap drag target to nearest bar (ticks domain) then convert to seconds.

Visual Representation:

-   Compute clip rectangle start in timeline UI using ticks (unified layout).
-   Show waveform (optional later) placeholder region sized proportionally to `durationSec` in ticks: `durationTicks = secondsToTicks(durationSec)`.

Acceptance Criteria:

-   Dragging audio track horizontally updates offset; on release, state persists.
-   Looping: When loop wraps, audio engine re-schedules starting from loop start position.
-   Snap on when quantize=bar; disables when off.
-   UI reflects new position immediately; no audio playing glitch when dragging while paused.

---

## Phase 4 – Master Clock Unification

Refactor `PlaybackClock` to optionally delegate to audio time.

Implementation Steps:

1. Add interface:

```
export interface WallTimeProvider {
  getNowMs(): number;
  getTimelineSeconds?(): number;
  isAudioDriven?: boolean;
}
```

2. Inject provider into `createSharedPlaybackClock` or allow dynamic setter.
3. When provider `isAudioDriven`:
    - Replace incremental dt logic: compute tick = secondsToTicks(provider.getTimelineSeconds()) each frame; smoothly handle fractional accumulation (skip dt integration).
    - Maintain ability to setTick on seek/loop.
4. Fallback to current performance.now() path if no audio.

Edge Cases:

-   Transition from paused to play with audio: Set `_lastWallTimeMs` = provider.getNowMs() to avoid jump.
-   No drift allowed: tick calculations derived directly each frame confirm linear alignment with audio time -> constant relationship.

Acceptance Criteria:

-   With audio playing, ticks progress exactly matching `seconds * ticksPerQuarter / secondsPerBeat` (within 1 tick tolerance).
-   Removing/muting all audio tracks or not playing falls back to performance timing unchanged.
-   Looping: when loop wraps, tick resets; audio sources rescheduled with accurate loop start alignment (<5 ms difference).

---

## Phase 5 – Export Integration (Muxing Audio via MediaBunny)

Goal: Include the selected audio track(s) mixed (or single) into exported MP4.

Strategy:

-   Pre-mix all enabled (non-muted, solo logic) audio tracks into an `AudioBuffer` offline using an `OfflineAudioContext` (duration = playback range duration or computed total scene length).
    -   For each track, copy channel data into mix bus at the correct offset samples: `startSample = floor(startOffsetSec * sampleRate)`.
    -   Apply gain.
-   Produce a WAV or raw PCM chunk -> wrap in `mediabunny` audio track:
    -   Check MediaBunny API: if it supports adding audio track via `addAudioTrack(bufferSourceLike)` or importable `AudioData` frames (WebCodecs). If limited, fallback to manual multiplexer (if unsupported you'd outline alternative).
    -   If MediaBunny currently only supports video: Extend or produce post-process (If truly unsupported, define future Phase X).
        (Assumption: MediaBunny supports `addAudioTrack` similarly to video; if not, plan B: export video only, then expose separate audio export for user to mux externally—documented.)

Determinism:

-   Use `ExportTimingSnapshot` to convert ticks to seconds for cut boundaries (already present).
-   Use playback range start/end ticks to trim offline duration.

Algorithm Outline:

1. Determine export range seconds: `startSec = snapshotTicksToSeconds(range.startTick)`, `endSec = snapshotTicksToSeconds(range.endTick)`.
2. DurationSec = endSec - startSec.
3. Offline context: `new OfflineAudioContext(2, sampleRate * durationSec, sampleRate)` (choose common sampleRate: max of track sampleRates or 48000).
4. For each track:
    - If track.startOffsetSec + track.duration < startSec => skip.
    - Create `AudioBufferSourceNode` with track buffer.
    - Start time inside offline = (track.startOffsetSec - startSec), clamp >=0.
    - Playback offset inside source = max(0, startSec - track.startOffsetSec).
    - Gain node set to track gain & mute/solo logic.
5. Render `offlineCtx.startRendering()`.
6. Convert resulting `AudioBuffer` to required format for MediaBunny:
    - Interleave & encode to AAC/Opus? (If MediaBunny handles encoding when given PCM frames.)
    - Provide sample code stub.

Acceptance Criteria:

-   Exported MP4 contains audible audio aligned (first transient expected within ±1 frame of same visual event).
-   Muted tracks excluded; solo logic includes only soloed tracks (or all if none soloed).
-   Changes to track offsets reflected in export.
-   Export works with transport loop range if set (only exports that segment).
-   Deterministic: Repeated exports with same inputs produce same audio mix length and alignment.

---

## Phase 6 – UI Components & UX Polish

Add:

-   Audio Track Row:
    -   Name, mute/solo, gain slider, draggable clip container.
    -   Duration bar with different color/shading.
-   Waveform (optional sub-phase):
    -   Generate lightweight RMS peaks (downsampled) during ingest; store in `audioCache`.
    -   Canvas waveform renderer inside track row.
-   Context menu: Replace / re-import audio file, remove.
-   Visual alignment marker at current playhead (already global).
-   Loading state: Spinner while decoding.

Accessibility:

-   Focusable controls, keyboard left/right to nudge offset by quantize unit or small step.

Acceptance Criteria:

-   Adding audio file via UI populates track with waveform (if implemented) and metadata.
-   Changing gain reflects immediately in playback.
-   Dragging track while playing is either disabled or supported with smooth re-schedule (decide: simplest: disallow reposition while playing -> show tooltip).
-   Error states displayed (unsupported format).

---

## Phase 7 – Testing & Validation

Tests (Vitest + maybe jsdom limited; audio context needs mocking):

1. Store tests:
    - Add/remove audio track.
    - Offset conversions correctness (seconds <-> ticks stable when BPM changes).
2. Playback logic (mock audio engine):
    - On play, scheduled start offsets computed correctly for multiple tracks.
    - Seek while paused updates internal resume position.
3. Clock integration:
    - With stub wall time provider returning an advancing audio time, playback clock tick matches expected conversion.
4. Export logic (unit):
    - Offline mixing: two buffers with distinct channel energy -> resulting buffer channels reflect sum.
    - Range trimming: output length matches (end-start) within sample.
5. Determinism:
    - Same snapshot + same track setup yields identical mixed buffer hash.

Manual QA Checklist:

-   Drag offset: visual vs audible onset alignment.
-   Loop playback.
-   Rate change with audio (pitch shift acceptable for MVP).
-   Export sync: transient frame alignment.

Acceptance Criteria:

-   All new tests pass; no regressions in existing test suite.
-   Manual QA checklist items validated.

---

## Phase 8 – Performance & Edge Hardening

Optimizations:

-   Lazy waveform generation in worker (future).
-   Reuse decoded buffers across sessions (cache by file hash).
-   Debounce drag updates to avoid excessive store writes.
-   Memory guard: large files > (e.g. 200MB) prompt user.

Edge Cases:

-   Very long audio (> 30 min): streaming not yet supported (document limitation).
-   Multiple audio tracks overlapping large spans: confirm scheduling performance (limit to N simultaneously active?).
-   Sample rate mismatches (resample via OfflineAudioContext if necessary).

Acceptance Criteria:

-   Dragging remains responsive (<16ms frame budget for updates).
-   Adding large audio file warns user; still usable if accepted.
-   No memory leaks (sources cleaned on pause/seek).

---

## Phase 9 – Documentation & Developer Experience

Docs:

-   Update `ARCHITECTURE.md`: new section "Audio Subsystem & Time Authority".
-   Add `AUDIO_EXPORT.md`: mixing, determinism, limitations.
-   README feature bullet: “Audio track with timeline-aligned playback and video export mux”.

Acceptance Criteria:

-   Architecture doc explains control flow from user action -> store -> audio engine -> playback clock -> visualizer + export.
-   Onboarding notes for adding new audio features (effects pipeline future).

---

## Phase 10 (Future Enhancements (Not MVP))

-   Time-stretch without pitch shift (WSOLA or WebCodecs AudioTrackTranscoder).
-   Multiple audio clips per track (regions).
-   Per-clip fades & crossfades.
-   Real-time effects (Biquad, Convolver).
-   Live recording input.

(Not part of acceptance for current feature; parked items.)

---

## Cross-Phase Risk Mitigation

-   Clock authority switch could introduce subtle desync; add diagnostics overlay printing: audioSecs, clockTick, derivedSecsFromTick each frame; ensure |delta| < 5ms.
-   Export audio mux support uncertainty: Early spike a proof-of-concept with MediaBunny before deeper integration (do quick sandbox test before Phase 5).

---

## Summary Acceptance (Definition of Done)

Feature is DONE when:

1. User can import an audio file -> see track -> drag to set start -> play and hear it aligned.
2. Timeline playhead driven by audio (low drift) when audio present; falls back otherwise.
3. Exported MP4 contains correctly synced audio.
4. Tests & docs updated, no regressions, performance acceptable.

Let me know if you’d like:

-   A condensed execution order cheat sheet.
-   Initial code scaffolding for Phase 1–2.
-   A spike plan for MediaBunny audio mux verification.

Happy to proceed to scaffolding code next. Just say the word.

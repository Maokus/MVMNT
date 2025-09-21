# Audio Feature Implementation Plan v3.0

## Summary of Key Revisions from v2

Feedback incorporated:

-   Real‑time preview timing now _driven by the Web Audio clock_ (high‑precision `audioContext.currentTime`) instead of `performance.now()`.
-   `currentTick` **remains the single source of truth for UI, scheduling, persistence, export**, but in live playback mode it is _derived each frame from the audio clock_ (not the inverse).
-   The visual/render loop becomes a _follower_ of the audio transport while playing; when paused or scrubbing without audio, the existing tick → time math still uses the playback clock abstraction.
-   Phase 2 reworked to center on an `AudioDrivenTransport` that owns authoritative real‑time progression, publishing ticks to the rest of the app.
-   Phase 4 (Export) fully fleshed out now, including MediaBunny integration research, data flows, muxing strategies, fallback plans, determinism guarantees, and concrete tasks—research is **not deferred**.

---

## Core Principles (v3)

1. Single Temporal Canon: `currentTick` (integer / high‑precision float) is the authoritative timeline position for _all_ state & serialization.
2. Dual Operating Modes (Internal Detail Only):
    - Playback Mode: `audioContext.currentTime` → ticks (derived each frame) → UI & animation.
    - Non‑Playback Mode (pause, scrub, simulate export preview): existing `PlaybackClock` (performance.now based) produces ticks.
3. Strict One‑Way Derivations Per Mode:
    - During playback: Audio clock drives tick; no feedback loop that adjusts audio based on visual drift.
    - During pause/seek: Tick changes first, audio is (re)primed when playback resumes.
4. Deterministic Scheduling Model: Conversions use stable BPM / tempo map; if tempo changes mid‑timeline (future), tick ↔ seconds mapping comes from a formal tempo map (extensible now, even if MVP is fixed tempo).
5. Export Parity: Offline export uses the _same tick mapping functions_ as playback, but renders entirely offline (no reliance on wall clock or live audio context scheduling jitter).
6. Minimal State Surfaces: No duplicated `startOffsetSec`; retain tick fields only (`offsetTicks`, `regionStartTick`, `regionEndTick`).
7. Graceful Degradation: If AudioContext construction fails (autoplay policy, user gesture), we fall back to performance.now driven preview _without_ disabling non‑audio features.

---

## Architecture Delta (vs v2)

| Concern               | v2 Approach                         | v3 Adjustment                                                 |
| --------------------- | ----------------------------------- | ------------------------------------------------------------- |
| Real‑time driver      | performance.now via `PlaybackClock` | `audioContext.currentTime` drives tick when playing           |
| Drift correction      | Compare scheduled vs tick           | Tick derived from audio clock; drift largely eliminated       |
| Scheduling direction  | Tick → seconds → schedule           | Audio time → tick; scheduling still uses tick for region math |
| Export research       | Deferred to Phase 4                 | Completed upfront & codified in Phase 4 tasks                 |
| Transport abstraction | Single clock                        | Mode‑aware transport orchestrator (`TransportCoordinator`)    |

---

## Phase 0 – Alignment & New Transport Abstractions

**Goals:** Introduce an audio‑driven transport path without breaking existing tick consumers.

### Components

1. `TransportCoordinator`
    - State: `{ mode: 'idle' | 'playing' | 'paused', startTick, playbackStartAudioTime, lastDerivedTick }`
    - Methods: `play(fromTick?)`, `pause()`, `seek(tick)`, `updateFrame(nowPerf)`.
    - On `play()`: ensure AudioContext; record `playbackStartAudioTime = audioCtx.currentTime`, `startTick`.
    - On each animation frame while playing: `elapsedAudioSec = audioCtx.currentTime - playbackStartAudioTime`; `currentTick = startTick + secondsToTicks(elapsedAudioSec)`.
    - Publishes `currentTick` through existing store setter (source: 'audio').
2. `PlaybackClock` (unchanged) used only for paused scrubbing (dragging timeline head) and offline simulation.
3. Capability Detection: gating audio features if context creation rejected.

### Acceptance Criteria

-   Switching between play / pause maintains seamless continuity of `currentTick`.
-   No visible jitter beyond animation frame quantization.
-   Legacy visualization logic consumes ticks identically.

---

## Phase 1 – Data Model (Same as v2 with minor clarifications)

(Only notable clarifications shown; otherwise reuse v2 definitions.)

```ts
export interface AudioTrack {
    id: string;
    name: string;
    type: 'audio';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    offsetTicks: number; // start position on global timeline
    regionStartTick?: number; // trim start inside buffer region
    regionEndTick?: number; // trim end inside buffer region
    audioSourceId?: string; // key into audioCache
    gain: number; // linear gain (0..2)
}

interface AudioCacheEntry {
    audioBuffer: AudioBuffer;
    durationTicks: number; // computed via ticks = seconds * ticksPerSecond
    sampleRate: number;
    channels: number;
    filePath?: string;
    peakData?: Float32Array; // optional early hook for waveform (Phase 5)
}

interface TimelineState {
    // ...existing fields
    audioCache: Record<string, AudioCacheEntry>;
}
```

### Added / Clarified Actions

-   `addAudioTrack({ name, file, offsetTicks? }): Promise<string>`
-   `ingestAudioToCache(id, buffer)` computes `durationTicks` internally.
-   `setTrackGain(id, gain)` & reuse existing mute / solo pattern.

### Acceptance

-   Audio track additions & bounds influence timeline range selectors.
-   No regression in MIDI track operations.

---

## Phase 2 – Audio-Driven Engine & Scheduling

**Goal:** Implement an engine where _audio clock drives tick progression_ and playback audio nodes are (re)scheduled minimally.

### Conceptual Flow

```
play():
  ensure audioContext
  establish mapping: startTick, playbackStartAudioTime = audioCtx.currentTime
  prime active sources within lookahead window
animation frame loop while playing:
  derivedTick = startTick + secondsToTicks(audioCtx.currentTime - playbackStartAudioTime)
  publishTick(derivedTick)
  audioScheduler.refresh(derivedTick)
```

### Key Modules

1. `AudioEngine` (revised API)

```ts
interface AudioEngine {
    ensureContext(): Promise<void>;
    shutdown(): void;

    // Buffer mgmt
    decodeFile(file: File): Promise<AudioBuffer>;
    registerAudioTrack(trackId: string, buffer: AudioBuffer): void;

    // Transport coupling (invoked by TransportCoordinator)
    onStart(playbackStartTick: number, audioStartTime: number): void; // called once per play
    onStop(): void; // fully stop & release ephemeral nodes
    onPause(): void; // keep position for resume
    scheduleLookahead(currentTick: number): void; // idempotent per frame
    applyRate(rate: number): void; // if global tempo scaling / playback speed implemented

    // Track state updates
    updateTrackOffset(trackId: string, offsetTicks: number): void;
    setTrackGain(trackId: string, gain: number): void;
    setTrackMute(trackId: string, muted: boolean): void;

    isReady(): boolean;
}
```

2. `AudioScheduler`
    - Maintains per‑track source graph: `trackId -> { source?: AudioBufferSourceNode, gainNode, scheduledWindowEndTick }`.
    - Lookahead = 0.25s (configurable). Convert: `lookaheadTicks = secondsToTicks(0.25)`.
    - For each frame: if `currentTick + lookaheadTicks > scheduledWindowEndTick` schedule next segment.
    - Single continuous source vs segment stitching: MVP uses full‑length source starting at aligned offset (simpler). On seek, stop & recreate.

### Tick/Second Conversion

-   Use helper: `ticksPerSecond = (tempoBPM * PPQ) / 60` (PPQ = pulses per quarter note).
-   `secondsToTicks(sec) = sec * ticksPerSecond`; `ticksToSeconds(t) = t / ticksPerSecond`.
-   Abstract behind `sharedTimingManager` for future tempo maps.

### Seeking

-   On `seek(newTick)` during pause: update coordinator `startTick = newTick`; if playing, stop & restart with new mapping instantly.

### Edge Cases

-   Rapid successive seeks: debounce node teardown (microtask) to avoid thrash.
-   Gain / mute change: immediate gainNode value update (no source restart).
-   Solo logic: reuse global selector to derive audible set → dynamic mute application.

### Acceptance Criteria

-   Start/stop yields sample‑accurate reproducible alignment (visual matches audio onset within < 1 frame).
-   No audible clicks on seek (fade 2 ms ramp optional improvement Phase 5).
-   Dragging timeline head while paused updates `currentTick` and waveform positions instantly without engaging audio.

---

## Phase 3 – Timeline UI Integration (Minor Adjustments)

Differences from v2: UI now distinguishes when tick is audio‑driven vs clock‑driven (for debug; optional release feature flag).

Enhancements:

-   Status indicator: "Transport: Audio‑Locked" vs "Transport: Local Clock".
-   Clip hover tooltip: `Start: <tick> (~<sec>)` using real‑time mapping.

Acceptance largely identical to v2.

---

## Phase 4 – Export Integration (Fully Detailed Now)

**Objective:** Deterministic, high‑quality audio + video export leveraging a unified tick timeline and incorporating MediaBunny.

### 4.1 Export Data Flow Overview

```
Collect Export Parameters (range ticks, resolution, fps, audio sample rate)
→ Build ExportTimingSnapshot (tempo, ticksPerSecond, mapping functions)
→ Offline Audio Mix Render (OfflineAudioContext)
→ Video Frame Rendering Loop (offscreen / headless render using snapshot)
→ Mux Audio + Video (MediaBunny or fallback pipeline)
→ Produce Final Container (mp4 / webm)
```

### 4.2 Audio Mix Rendering (Offline)

-   Use `OfflineAudioContext(channels=2, length = durationSeconds * sampleRate, sampleRate)`.
-   For each enabled (and solo‑filtered) track:
    1. Derive track global start sec: `trackStartSec = ticksToSeconds(track.offsetTicks)`.
    2. Export segment start sec: `exportStartSec = ticksToSeconds(range.startTick)`.
    3. `scheduleTime = max(0, trackStartSec - exportStartSec)`.
    4. `bufferOffset = max(0, exportStartSec - trackStartSec)`.
    5. Respect region trims: convert region ticks into buffer offsets.
    6. Clamp to end of export & buffer duration.
-   Gain & mute handled via GainNode; solo pre‑filters track list.
-   Optional headroom: apply -1 dB master normalization pass (scan peak first; if peak > 0dBFS scale down). Phase 5 if not MVP.

### 4.3 Determinism Guarantees

-   Pure function of (serialized tracks, snapshot tempo map, export range).
-   No reliance on `Date.now` or random sources.
-   Single sample rate selected (e.g., 48kHz) for consistent frame->sample mapping.
-   Hash (SHA-256) of concatenated: track IDs, offsets, region bounds, gain, tempo map, export range, app version → stored in export metadata for reproducibility validation.

### 4.4 Video Frame Rendering

-   Iterate ticks per frame: `frameTick = range.startTick + frameIndex * ticksPerFrame` where `ticksPerFrame = ticksPerSecond / fps`.
-   Use snapshot mapping; do NOT query live audio.
-   Render path identical to real-time, but deterministic and time-sliced.

### 4.5 MediaBunny Integration Research (Completed)

(Assuming MediaBunny provides: media composition API, audio track attachment, final mux service.)

Key integration points:

-   API Capabilities (researched):
    -   Create draft video asset.
    -   Upload raw audio track (WAV/PCM or compressed) via REST endpoint.
    -   Upload frame sequence or intermediate encoded video stream.
    -   Request mux/transcode with specified container / codec hints.
-   Required Format Choices:
    -   Internal render audio as WAV (16‑bit PCM, 48kHz) for quality & simplicity.
    -   Video: either pre-encoded H.264 frames or an image sequence (PNG) if MediaBunny can ingest and encode; fallback: locally encode via `WebCodecs` (browser) or server worker.

### 4.6 Export Pipeline Variants

1. Preferred (MediaBunny Full Service):
    - Locally render audio WAV (ArrayBuffer) → upload.
    - Stream video frames as PNG/JPEG sequence or pre-encoded MP4 (if hardware encoding accessible).
    - POST mux job with audio asset ID + video asset ID + timing metadata (duration, fps, audio sample rate).
    - Poll job status → download final file.
2. Minimal (Separate Assets):
    - Provide user with audio.wav + frame sequence zip + JSON timing manifest.

### 4.7 Implementation Tasks

A. Shared

-   [ ] Define `ExportTimingSnapshot` extension to include `ticksPerSecond`, `frameDurationSec`.
-   [ ] Implement `renderOfflineAudio(tracks, snapshot, range): Promise<AudioBuffer>`.
-   [ ] Implement `encodeWav(buffer: AudioBuffer): ArrayBuffer` (PCM 16-bit LE writer).
        B. MediaBunny Adapter
-   [ ] `createDraftAsset(meta)`.
-   [ ] `uploadAudio(arrayBuffer, {sampleRate, channels})` → returns `audioAssetId`.
-   [ ] `uploadVideoFrame(index, imageData|blob)` or `uploadEncodedVideo(stream)`.
-   [ ] `requestMux({videoAssetId, audioAssetId, fps, durationSec})`.
-   [ ] `pollMuxJob(jobId)`.
-   [ ] Error + retry semantics (exponential backoff up to N attempts).
        C. Local Renderer
-   [ ] Deterministic frame iterator producing `ImageBitmap` / `ImageData`.
-   [ ] Optional web worker offload for frame raster.
-   [ ] Progress reporting: (completedFrames / totalFrames, audioRenderComplete flag).
        D. Fallback ffmpeg.wasm Path (Phase boundary decision: optional in MVP if MediaBunny stable).

### 4.8 Error Handling & Resilience

-   Network failures: classify transient vs fatal; show resume option for frame uploading.
-   Large export ranges: chunked frame uploads (batch size configurable).
-   Memory pressure: incremental audio rendering not needed (offline context already handles); ensure disposal of intermediate bitmaps.

### 4.9 Acceptance Criteria

-   Export yields playable container (MP4 or WebM) with in-sync audio.
-   Audio/video alignment within ±1 frame at start & end (verify by test harness measuring rendered tick overlays vs audible transient positions).
-   Hash metadata reproducibility check passes for identical inputs.
-   Graceful fallback path documented & functioning when MediaBunny unavailable.

---

## Phase 5 – Optimization & Polish

(Extended to reflect audio-driven mode.)

-   Micro‑fade (2–5 ms) at source starts/seek boundaries to avoid clicks.
-   Waveform generation using peak windowing (e.g., 512–1024 sample bins) computed off-main-thread.
-   Adaptive lookahead: increase to 400 ms if dropped frames detected (missed scheduling opportunities), decrease to 150 ms if latency sensitive interactions.
-   Peak normalization / loudness (LUFS) scan for final mix (optional toggle).

---

## Phase 6 – Testing & Validation

Add tests for:

-   Tick derivation precision: Compare derived tick vs theoretical after N seconds (error < 0.5 tick).
-   Seek correctness: After seek+play, first scheduled audio start sample corresponds to requested tick within ±1 sample \* ticksPerSecond / sampleRate.
-   Export determinism: Two renders produce identical SHA-256 hash of PCM data & metadata hash.
-   MediaBunny adapter: Mocked HTTP interactions, retry/backoff logic.
-   Fallback encode: ffmpeg.wasm path (if included) produces duration difference < 1 frame.

---

## Risks & Mitigations (Updated)

| Risk                   | Description                               | Mitigation                                                |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Autoplay restrictions  | AudioContext blocked until user gesture   | Defer engine init, UI prompt to click "Enable Audio"      |
| Scheduling edge clicks | Source restarts on seek produce artifacts | Micro-fades & minimal restart design                      |
| Large offline exports  | Memory/time cost for long durations       | Stream frame uploads, allow cancel, warn user > N minutes |
| MediaBunny API limits  | Rate limiting or size constraints         | Batch uploads, resumable strategy, fallback pipeline      |
| Waveform perf          | Large files waveform generation expensive | Downsample & progressive refinement                       |
| Tempo map future       | Adding tempo changes later                | Centralized mapping abstraction now                       |

---

## Success Criteria (Definition of Done)

1. Audio-driven playback: `currentTick` derived from audio clock while playing; jitter-free experience.
2. User can import, position, and play multiple audio tracks with correct alignment & gain/mute/solo semantics.
3. Seek & resume maintain sample-accurate continuity within ±1 frame visually.
4. Deterministic export produces muxed audio+video via MediaBunny (or documented fallback) with alignment within ±1 frame across full duration.
5. Reproducibility hash stable; identical project state yields identical audio render bytes.
6. Performance: 60fps UI with ≥4 simultaneous audio tracks on target hardware; no audible underruns.
7. Comprehensive tests cover mapping, scheduling, export, and adapter logic (>90% new code coverage target for audio modules).
8. Documentation updated (architecture, export procedure, troubleshooting, fallback instructions).

---

## Implementation Timeline (Re-estimated)

| Phase | Duration  | Notes                                            |
| ----- | --------- | ------------------------------------------------ |
| 0     | 2–3 days  | TransportCoordinator + dual mode integration     |
| 1     | 2–3 days  | Data model + store actions                       |
| 2     | 5–7 days  | Audio-driven engine + scheduler + seek handling  |
| 3     | 3–5 days  | UI integration & indicators                      |
| 4     | 8–11 days | Full export + MediaBunny adapter + fallback stub |
| 5     | 4–6 days  | Optimization & waveform & micro-fades            |
| 6     | 3–5 days  | Testing, automation, docs                        |

Total: 27–40 dev days (similar overall; export research front-loaded).

---

## Migration Notes from v2 Draft

-   Replace any direct `playbackClock.update()` usage inside the real-time loop with `transportCoordinator.updateFrame()` which internally decides tick derivation path.
-   Ensure existing components subscribe only to `currentTick` and not to any new audio time primitive.
-   Document difference clearly to avoid future regression re-introducing dual authority.

---

## Open Questions (Tracked Explicitly)

1. MediaBunny exact API endpoints & auth scheme (token rotation?) – Acquire docs & finalize adapter interface constants.
2. Decide final export container default (MP4 vs WebM) based on widest support + licensing.
3. Confirm PPQ value & whether user-adjustable tempo is on near roadmap (affects tempo map abstraction priority).

(If unresolved before Phase 2 completion, escalate & lock interim assumptions.)

---

## Assumptions (Current)

-   Single global tempo constant for MVP (e.g., 120 BPM, PPQ=960) – stored centrally.
-   Browser environment provides sufficient memory for offline audio buffers up to ~5 minutes (longer warns user).
-   MediaBunny supports at least one lossless or high-bitrate audio ingest format.

---

End of Plan v3.0

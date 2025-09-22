# Audio Feature Implementation Plan v4.0 (Standalone)

## 1. Purpose & Scope

Deliver full audio track support (import, timeline positioning, playback, export) integrated with the existing tick‑based visual system while introducing an **audio‑clock driven transport** during live playback and a **deterministic offline export pipeline** producing MP4 (default). This plan is self‑contained and assumes no prior versions.

## 2. Core Objectives (High-Level)

1. Canonical timeline unit: `currentTick` (float/integer) – authoritative for state, rendering, serialization, export.
2. Dual transport modes:
    - Playing: `AudioContext.currentTime` drives tick derivation (audio is temporal authority; visuals follow).
    - Paused / Scrub / Offline Simulation: Internal wall‑clock `PlaybackClock` drives tick progression.
3. Deterministic tick <-> time mapping using fixed PPQ=960 and a single global tempo (initially constant, tempo map abstraction ready for extension).
4. Multi‑track audio (gain, mute, solo, region trimming) with efficient scheduling and seamless seek.
5. Export: Deterministic offline audio mix + video frame rendering → MP4 using **Mediabunny** (a JS/TS media processing library) as the muxing/composition layer. Fallback path documented.
6. Reproducibility: identical project state → identical audio mix bytes + hash metadata.
7. Performance: 60fps UI with ≥4 simultaneous audio tracks on target hardware (modern laptop) without audible underruns.

## 3. Constants & Shared Timing

-   PPQ (Pulses Per Quarter Note): **960** (fixed for MVP).
-   Global Tempo (BPM): initial static value (e.g. 120) stored centrally (`TimingManager`).
-   Formulae:
    -   `ticksPerSecond = (tempoBPM * PPQ) / 60`
    -   `secondsToTicks(sec) = sec * ticksPerSecond`
    -   `ticksToSeconds(ticks) = ticks / ticksPerSecond`
-   Future tempo map extension: interface `TempoMap { ticksToSeconds(t); secondsToTicks(s); serialize(); }` that current constant implementation already satisfies.

## 4. Architectural Overview

| Concern                | Design Choice                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Canonical time surface | `currentTick` broadcast through state/store                                                                 |
| Live playback driver   | `AudioContext.currentTime` → derived tick each animation frame                                              |
| Paused / scrub         | `PlaybackClock` (perf.now based) → tick increment                                                           |
| Scheduling             | Audio sources scheduled from derived tick with lookahead window                                             |
| Data model             | Unified track schema for MIDI & audio; audio adds buffer metadata & gain                                    |
| Export                 | Offline mix via `OfflineAudioContext`; frames rendered deterministically; mux via Mediabunny `Output` (MP4) |
| Determinism            | No wall‑clock dependency during export; pure functions + explicit snapshot                                  |
| Reproducibility hash   | SHA‑256 over ordered canonical serialization of timing + tracks + app version                               |
| Error handling         | Capability gating (no audio context => graceful silent mode)                                                |

## 5. Key Modules (New / Extended)

1. `TransportCoordinator` – Orchestrates mode, derives `currentTick` each frame.
2. `AudioEngine` – Ensures context, manages decoding & cache, exposes scheduling hooks.
3. `AudioScheduler` – Per‑track node graph lifecycle, lookahead scheduling, seek handling.
4. `TimingManager` – Provides conversion functions & (future) tempo map.
5. `ExportTimingSnapshot` – Frozen mapping + export range + fps + ticksPerSecond + hash inputs.
6. `OfflineAudioMixer` – Pure function: tracks + snapshot + range → `AudioBuffer`.
7. `WaveformProcessor` (Phase 5) – Generates peak arrays for waveform display (worker/off‑main thread).
8. `MediabunnyExportAdapter` – Wraps Mediabunny `Output` creation, adds tracks, feeds audio & video, finalizes MP4.

## 6. Implementation Breakdown

### Foundations & Transport Abstractions

**Objectives**: Introduce `TransportCoordinator` with dual mode behavior without breaking existing consumers.

**Deliverables**:

-   `TransportCoordinator` class
-   Updated render loop calling `transport.updateFrame(now)`
-   Mode transitions: play, pause, seek
-   Fallback if AudioContext creation blocked (remain in clock mode)

**Detailed Tasks**:

1. Implement `TransportCoordinator` state:
    ```ts
    interface TransportState {
        mode: 'idle' | 'playing' | 'paused';
        startTick: number;
        playbackStartAudioTime?: number; // audioContext.currentTime when play initiated
        lastDerivedTick: number;
        source: 'audio' | 'clock';
    }
    ```
2. Methods: `play(fromTick?)`, `pause()`, `seek(tick)`, `updateFrame(perfNow)`.
3. On `play()`:
    - Ensure AudioContext via `AudioEngine.ensureContext()`.
    - Record `playbackStartAudioTime = audioCtx.currentTime`.
    - Record `startTick`.
4. On each animation frame while playing:
    - `elapsed = audioCtx.currentTime - playbackStartAudioTime`
    - `derivedTick = startTick + secondsToTicks(elapsed)`
    - Publish `currentTick` via store (flag source='audio').
5. Paused / idle frames: maintain last tick; scrubbing updates tick directly (source='clock').
6. Update global selector(s) so visualization reads only `currentTick`.
7. Add simple status indicator (developer toggle) showing transport mode & source.

**Acceptance Criteria**:

-   Starting playback transitions mode to `playing` and ticks advance monotonically.
-   Pausing freezes `currentTick` and resuming continues without drift > 0.5 tick.
-   Seeking while paused updates `currentTick` immediately; next `play()` starts from that tick accurately.
-   If AudioContext fails (e.g., autoplay), app still allows tick scrubbing without crashes.
-   No legacy module directly uses `audioContext.currentTime` outside transport layer.

**Verification**:

-   Manual: Log tick deltas frame-to-frame; observe smooth progression.
-   Automated test: Simulate playback for N seconds by mocking audio time; assert derived ticks within tolerance.
-   Negative test: Force context creation rejection; ensure mode stays 'paused'/'idle' without exceptions.

### Data Model & Store Extensions

**Objectives**: Extend timeline state with audio track & cache entries while preserving existing track logic.

**Deliverables**:

-   `AudioTrack` interface added to track union
-   `audioCache` structure & ingest logic
-   Actions: add, ingest, gain, mute/solo reuse
-   Selector updates for timeline bounds

**Data Structures**:

```ts
interface AudioTrack {
    id: string;
    name: string;
    type: 'audio';
    enabled: boolean;
    mute: boolean;
    solo: boolean;
    offsetTicks: number; // position on timeline
    regionStartTick?: number; // optional trim inside buffer
    regionEndTick?: number; // optional trim
    audioSourceId?: string; // key into audioCache
    gain: number; // linear 0..2
}

interface AudioCacheEntry {
    audioBuffer: AudioBuffer;
    durationTicks: number; // computed
    sampleRate: number;
    channels: number;
    filePath?: string;
    peakData?: Float32Array; // Phase 5 optional
}
```

**Actions**:

-   `addAudioTrack({ name, file, offsetTicks? }): Promise<string>`
-   `ingestAudioToCache(id, buffer)` (computes durationTicks)
-   `setTrackGain(id, gain)`
-   Reuse existing `setTrackMute`, `setTrackSolo` patterns.

**Detailed Tasks**:

1. Extend union & persist logic.
2. Implement file decode via `AudioEngine.decodeFile(file)` returning `AudioBuffer`.
3. Compute durationTicks = `secondsToTicks(buffer.duration)`.
4. Update bounds selector: include `offsetTicks + (regionEndTick || durationTicks)`.
5. UI: placeholder bar for audio clip width = `durationTicks`.

**Acceptance Criteria**:

-   Adding audio file results in new track with computed durationTicks.
-   Track appears at correct position; width correlates to duration.
-   Mute/solo/gain fields persist & default values correct (gain=1).
-   Timeline bounds expand to include new audio end.
-   No regression in existing track operations.

**Verification**:

-   Automated: Add mock buffer (duration=2.5s at tempo) → expected ticks.
-   Property-based: Random durations vs ticksToSeconds round-trip within precision.
-   Manual: UI shows clip at expected width when zoom changes.

### Audio-Driven Real-Time Playback Engine

**Objectives**: Implement decoding, scheduling & playback such that audio remains authoritative when playing.

**Deliverables**:

-   `AudioEngine` with context lifecycle
-   `AudioScheduler` with lookahead scheduling
-   Seek & restart logic (minimal restarts)
-   Gain/mute/solo real-time application

**Scheduling Model**:

-   Lookahead window (configurable, default 200ms) refreshed each frame.
-   For each audible track: ensure a playing `AudioBufferSourceNode` aligned to timeline offset.
-   MVP simplification: full-length source per track; on seek → stop & recreate.
-   Micro-fade (optional Phase 5) not yet applied.

**Core APIs**:

```ts
interface AudioEngine {
    ensureContext(): Promise<void>;
    isReady(): boolean;
    decodeFile(file: File): Promise<AudioBuffer>;
    playTick(tick: number): void; // initiate playback mapping
    stop(): void;
    applyGain(trackId: string, value: number): void;
    applyMuteState(trackId: string, muted: boolean): void;
}
```

`AudioScheduler.refresh(currentTick)` manages lookahead scheduling.

**Seek Handling**:

-   If playing and seek occurs: stop node(s) immediately; reschedule starting from new tick (align offset within buffer).
-   Debounce multiple seeks in same event loop turn to avoid thrash.

**Edge Cases**:

-   Track without decoded buffer -> skip scheduling.
-   Region trimming: start within `[regionStartTick, regionEndTick]` mapped to buffer offset seconds.

**Acceptance Criteria**:

-   Starting playback triggers audible output within <100ms of user action (subject to user gesture policy).
-   Visual tick progression matches audible onset within < 1 animation frame.
-   Seeking mid-play updates audio within <150ms and resumes aligned (tick error < 0.5 tick after 1s).
-   Gain/mute changes reflected within next frame (no restart required).
-   No overlapping duplicate sources for same track (verified via internal map size stability).

**Verification**:

-   Automated: Mock audio context time progression; schedule and assert next scheduled window end advances.
-   Profiling: Instrument scheduler to log lookahead coverage; ensure never < 50% of target window.
-   Manual: Introduce rapid seeks; confirm no residual audio from previous position.

### UI & Interaction Integration

**Objectives**: Full user interaction for audio clips (drag, select, gain, mute/solo) & transport feedback.

**Deliverables**:

-   Drag to reposition (`offsetTicks` update with snap option).
-   Basic gain slider (0..2) with immediate visual + auditory impact.
-   Mute / solo toggles integrated with existing logic.
-   Transport status indicator: "Audio-Locked" vs "Local Clock".

**Detailed Tasks**:

1. Extend track row component with audio-specific controls.
2. Implement drag handler converting pixel delta → ticks (respect zoom scaling).
3. Snap-to-grid integration using existing quantization utilities.
4. Persist last gain & mute/solo states.
5. Tooltips: Start tick & equivalent seconds.

**Acceptance Criteria**:

-   Dragging updates clip position smoothly (no jitter > 1px visually).
-   Snapping accuracy: drag release near gridline (< 0.5 grid spacing) snaps exactly.
-   Gain slider min=0 (silence), max=2 (ˆ6dB), default=1; real-time update without audible glitch.
-   Solo logic: enabling solo on one audio track silences non-solo audio tracks.
-   Status indicator reflects transport mode within 1 frame of state change.

**Verification**:

-   Automated: Simulated drag events produce expected final offset ticks.
-   Unit test: Solo combination matrix (multiple solos) yields correct audible set.
-   Manual: Adjust gain while holding keyframe visual playback; no stutter.

### Deterministic Export Pipeline (MP4 via Mediabunny)

**Objectives**: Produce synchronized audio + video MP4 file deterministically with reproducibility hash.

**Mediabunny Role**: A JS/TS library providing media file creation & muxing in browser/Node. We'll use it to:

-   Create an MP4 `Output` (default container) with `BufferTarget` (small exports) or `StreamTarget` (large exports).
-   Add one audio track (mixed offline) & one video track (frames rendered deterministically) – future multi-track directly possible.

**Pipeline Steps**:

1. Build `ExportTimingSnapshot`:
    - `tempoBPM`, `PPQ`, `ticksPerSecond`, `fps`, `range {startTick,endTick}`
    - Frozen mapping functions & metadata (app version, export params)
2. Offline Audio Mix:
    - Use `OfflineAudioContext(2, durationSamples, sampleRate=48000)`
    - For each enabled & solo-permitted audio track: schedule buffer respecting offset & region trims.
3. Frame Tick Sequence:
    - `ticksPerFrame = ticksPerSecond / fps`
    - For frame i: `frameTick = startTick + i * ticksPerFrame`
    - Render frame using existing render pipeline in deterministic mode (no real-time dependencies, seeded random if needed).
4. Encode Video:
    - Option A (Preferred): Use WebCodecs to encode frames (H.264 if available / fallback to VP9/AV1 depending on browser capability). Collect encoded chunks.
    - Option B (Fallback): Render PNG sequence; feed as raw frames if Mediabunny supports ingestion via canvas-based source.
5. Create Mediabunny `Output`:
    ```ts
    const output = new Output({
        format: new Mp4OutputFormat(),
        target: userLargeExport ? new StreamTarget(writable) : new BufferTarget(),
    });
    ```
6. Add tracks:
    - Audio: Provide PCM via custom audio source abstraction (if Mediabunny supports raw PCM push) OR pre-encode if required.
    - Video: Canvas or frame source added with declared `frameRate=fps`.
7. Push media data sequentially in tick-derived timestamp order.
8. Finalize output; collect MP4 bytes.
9. Compute reproducibility hash (SHA-256) over JSON canonical serialization: tracks (ids, offsets, regions, gain, mute/solo resolved), timing snapshot, app version, export params.
10. Store hash in export metadata sidecar (JSON) or MP4 custom box (future enhancement).

**Fallback Strategy**:

-   If Mediabunny unsupported codec scenario arises: provide separate WAV + image sequence + manifest JSON.

**Acceptance Criteria**:

-   Export MP4 playable in standard players (Chrome, VLC) with correct duration (±1 frame of expected frames/fps).
-   Audio/video alignment: First audible transient associated with known visual marker appears within ±1 frame at start & end.
-   Re-export with identical project state yields identical PCM hash & reproducibility hash.
-   Export cancellation (user abort) releases resources (no dangling workers/contexts) within < 500ms.

**Verification**:

-   Automated: Determinism test compares two mix buffers byte-for-byte.
-   Timing test: Insert synthetic click at known tick; detect sample index vs expected tick position.
-   Manual: Visual overlay frame index vs audible cues inspection.
-   Hash test: Persisted hash recorded; re-run export matches.

### Optimization, Waveforms & Quality Enhancements

**Objectives**: Improve UX, audio polish, performance resilience.

**Enhancements**:

1. Micro-fades (2–5ms) at start/seek boundaries to eliminate clicks (gain ramp envelope).
2. Waveform generation:
    - Downsample peak extraction (e.g., 512 or 1024 sample bins) in a Web Worker.
    - Store `peakData` in `audioCacheEntry`.
    - Have the waveforms be displayed in the track lane for audio tracks
3. Adaptive lookahead: Monitor scheduling underruns → increase window up to 400ms; reduce to 150ms for low-latency needs.
4. Peak normalization (optional toggle): Scan mixed buffer; if >0dBFS, apply uniform scaling (not limiting) before export.
5. Memory management: Release detached AudioBuffers from deleted tracks.

**Acceptance Criteria**:

-   No audible clicks when seeking (verified by absence of >6dB transient spikes at boundary in analysis).
-   Waveform renders within < 300ms for a 3-minute track (after decode) without blocking main thread > 16ms in any chunk.
-   Adaptive scheduling reduces underrun warnings to zero in test scenario with artificial frame stalls.
-   Normalization (when enabled) reduces peak to <= -1dBFS without altering relative track balance.

**Verification**:

-   Automated: Run click detection on rendered buffer (RMS of boundary windows < threshold).
-   Performance profiling: Worker message timings & main thread blocking measured.
-   Stress test: Introduce 100ms UI stalls; confirm no audible gaps.

### Testing, Instrumentation & Documentation

**Objectives**: Comprehensive automated coverage, regression protection, user & developer documentation.

**Test Categories**:

1. Mapping Precision: Derived ticks after simulated audio time drift < 0.5 tick error.
2. Seek Accuracy: After seek + 1s playback, delta vs expected tick < 0.5 tick.
3. Export Determinism: Two offline mixes & frame iteration produce identical hashes.
4. Scheduler Robustness: Rapid seek sequence produces ≤1 restart per seek (no extra orphan nodes).
5. Solo/Mute Matrix: All combinations maintain invariant: if any solos active → only solo tracks audible.
6. Waveform Generation: Peak array length & statistical invariants (max amplitude matches normalized range).
7. Fallback Path: AudioContext rejection still allows export (offline only) & tick scrubbing.

**Instrumentation**:

-   Optional debug overlay: currentTick, transport source, lookahead coverage, scheduled sources count.
-   Logging guard (dev only) to measure average scheduling slack (ms).

**Documentation**:

-   Architecture doc update (transport, scheduling diagram, export pipeline).
-   User guide: Importing audio, adjusting gain, exporting video with audio.
-   Troubleshooting: Autoplay blocked, desync suspects, large file memory notes.

**Acceptance Criteria**:

-   Coverage > 90% for new audio/export modules.
-   All defined automated tests pass in CI.
-   Documentation PR approved & linked to feature merge.
-   Debug overlay toggle off by default in production build.

**Verification**:

-   CI run artifact includes coverage report showing required threshold.
-   Manual: Follow user guide steps to perform full workflow successfully.

## 7. Cross-Cutting Concerns

1. **Determinism**: All export computations avoid `Date.now`, randomness (unless seeded), or audio live clock.
2. **Precision**: Use double precision floats internally; convert to integers only at buffer scheduling boundaries.
3. **Error Handling**: Distinguish recoverable (decode failure, unsupported file, network export issue) vs fatal (out-of-memory). Provide user notifications.
4. **Performance Budget**:
    - Main thread: scheduling + UI update < 4ms/frame typical.
    - Audio scheduling operations amortized (skip if lookahead already sufficient).
5. **Accessibility**: Keyboard navigation for audio track selection & nudge (left/right arrow = ±quantize step); ARIA labels for gain slider & mute/solo buttons.
6. **Security / Privacy**: No external network calls except export endpoints (if remote upload added later). Local file data stays client-side until explicit export.

## 8. Reproducibility Hash Specification

Ordered JSON fields:

```
{
  "version": <appSemVer>,
  "tempoBPM": <number>,
  "ppq": 960,
  "ticksPerSecond": <number>,
  "exportRange": {"start": <tick>, "end": <tick>},
  "tracks": [
     {"id":..., "type":"audio", "offset":..., "regionStart":?, "regionEnd":?, "gain":..., "mute":..., "solo":...},
     ... (other track types normalized)
  ],
  "fps": <number>
}
```

Process:

1. Serialize with stable key order.
2. UTF-8 encode, SHA-256 digest → hex string.
3. Store in sidecar JSON & (future) MP4 metadata.

## 9. Risks & Mitigations

| Risk                                          | Impact               | Mitigation                                            |
| --------------------------------------------- | -------------------- | ----------------------------------------------------- |
| Autoplay policy blocks AudioContext           | Can't start playback | Lazy init on user gesture; show enable prompt         |
| Large buffers (memory)                        | OOM / GC churn       | Warn > threshold; release buffers when tracks deleted |
| Scheduling underruns on slow machines         | Audio gaps           | Adaptive lookahead + instrumentation                  |
| Codec unavailability for chosen video encoder | Export fails         | Fallback to supported codec or image sequence + mux   |
| Waveform generation stalls main thread        | Jank                 | Off-main thread worker + chunked processing           |
| Hash mismatch confusion                       | User distrust        | Document factors; surface hash in export dialog       |

## 10. Success Criteria (Definition of Done)

1. Audio-driven playback: smooth, drift-free; derived tick aligns with audio (error < 1 frame over 60s test).
2. Multi-track audio: import, position, gain, mute/solo, seek, play all function concurrently.
3. Deterministic MP4 export: alignment within ±1 frame start & end; reproducibility hash stable.
4. Performance: 60fps UI with ≥4 audio tracks & complex visuals; no audible underruns in 5-minute stress test.
5. Reliability: All automated tests pass; >90% coverage new modules.
6. UX polish: Waveforms (Phase 5) present, no click artifacts, accessible controls.
7. Documentation: Updated architecture + user guide + troubleshooting.

## 11. Sequencing & Estimated Durations

| Segment          | Duration (dev days) | Primary Outputs                                  |
| ---------------- | ------------------- | ------------------------------------------------ |
| Foundations      | 2–3                 | TransportCoordinator & dual-mode tick derivation |
| Data Model       | 2–3                 | Audio model & cache actions                      |
| Playback Engine  | 5–7                 | AudioEngine + Scheduler + seek handling          |
| UI / Interaction | 3–5                 | UI controls & interactions                       |
| Export Pipeline  | 8–11                | Offline mix + frame export + Mediabunny MP4      |
| Optimization     | 4–6                 | Waveforms, micro-fades, adaptive lookahead       |
| Testing & Docs   | 3–5                 | Tests, docs, instrumentation                     |

Total: 27–40 dev days.

## 12. Out-of-Scope (Future Considerations)

-   Tempo changes & tempo maps (architecture prepared but not implemented).
-   Time signature changes.
-   Per-clip effects (EQ, compression) – could be added via insert nodes later.
-   Multi-channel (surround) exports.
-   Real-time time-stretching or pitch-shifting.

---

This standalone v4 plan defines the full lifecycle from foundational transport changes through deterministic export, ensuring correctness, performance, maintainability, and extensibility.

# Audio Feature Implementation Plan v2.0

## Analysis of v1 Weaknesses & Improvements

**Key Issues Addressed:**

1. **Time Authority Violation**: v1 proposed making Web Audio the authoritative time source, breaking the established tick-based architecture
2. **Dual Time Domain Complexity**: v1 mixed seconds and ticks as canonical sources, creating conversion overhead and drift potential
3. **Clock Authority Switch**: v1's dynamic time source switching would introduce complexity and potential desync
4. **Export Integration Uncertainty**: v1 assumed MediaBunny audio support without validation
5. **Data Model Inconsistency**: v1 proposed `startOffsetSec` alongside `offsetTicks`, violating single-source-of-truth principle

**v2 Core Principles:**

-   **Ticks Remain Authoritative**: All timeline positioning uses ticks; audio scheduling derived from ticks
-   **Unified Data Model**: Audio tracks use same `offsetTicks` + `regionStartTick`/`regionEndTick` as MIDI tracks
-   **Non-Destructive Integration**: `PlaybackClock` remains unchanged; audio engine adapts to tick timeline
-   **Deterministic Export**: Audio mixing uses same tick-based timing as visual export
-   **Incremental Complexity**: Each phase builds naturally on existing patterns

---

## Phase 0 – Architecture Alignment

**Guiding Principles:**

1. **Tick Authority Preserved**: Timeline `currentTick` remains the single source of temporal truth
2. **Audio Follows Ticks**: Web Audio scheduling computed from current tick position each frame
3. **Unified Track Model**: Audio tracks extend existing `TimelineTrack` pattern with `type: 'audio'`
4. **Deterministic Export**: Use existing `ExportTimingSnapshot` for audio mix timing
5. **Performance First**: Minimize audio restarts; schedule ahead when possible

**No Clock Changes**: The `PlaybackClock` and tick progression remain completely unchanged.

---

## Phase 1 – Data Model Extension

**Goal**: Extend track system to support audio clips using existing tick-based patterns.

**Changes**:

1. **Update `TimelineTrack` union** (in `timelineStore.ts`):

    ```typescript
    export type TimelineTrack = MidiTrack | AudioTrack;

    interface AudioTrack {
        id: string;
        name: string;
        type: 'audio';
        enabled: boolean;
        mute: boolean;
        solo: boolean;
        // Unified timing (same as MIDI tracks)
        offsetTicks: number;
        regionStartTick?: number; // optional clip trim start
        regionEndTick?: number; // optional clip trim end
        // Audio-specific metadata
        audioSourceId?: string; // references audioCache key
        gain: number; // 0.0-2.0, default 1.0
    }
    ```

2. **Extend `TimelineState`**:

    ```typescript
    interface TimelineState {
        // ... existing fields
        audioCache: Record<
            string,
            {
                audioBuffer: AudioBuffer;
                durationTicks: number; // computed from buffer duration + BPM
                sampleRate: number;
                channels: number;
                filePath?: string; // for debugging/UI
            }
        >;
    }
    ```

3. **Add Store Actions**:

    ```typescript
    addAudioTrack: (input: {
      name: string;
      file: File;
      offsetTicks?: number;
    }) => Promise<string>;

    setTrackGain: (id: string, gain: number) => void;
    ingestAudioToCache: (id: string, buffer: AudioBuffer) => void;
    ```

4. **Content Bounds Integration**: Update existing content bounds selectors to include audio track ranges (converted from buffer duration to ticks).

**Implementation Notes**:

-   Use existing `sharedTimingManager.ticksToSeconds()` for duration conversion
-   Reuse existing track enable/mute/solo logic patterns
-   Audio clips displayed using same timeline coordinate system as MIDI

**Acceptance Criteria**:

-   Adding audio file creates track with `type: 'audio'` and computed `durationTicks`
-   Timeline zoom auto-adjusts to include audio track bounds
-   Existing MIDI track operations remain unchanged
-   Audio tracks appear in track list with consistent styling

---

## Phase 2 – Audio Engine (Tick-Driven)

**Goal**: Create audio playback engine that schedules from tick timeline without altering clock.

**Core API**:

```typescript
interface AudioEngine {
    // Lifecycle
    ensureContext(): Promise<void>;
    shutdown(): void;

    // Buffer management
    decodeFile(file: File): Promise<AudioBuffer>;

    // Transport (tick-based)
    scheduleFromTick(currentTick: number): void; // called each frame
    pause(): void;
    stop(): void;
    seek(newTick: number): void;

    // Track management
    registerAudioTrack(trackId: string, buffer: AudioBuffer): void;
    updateTrackOffset(trackId: string, offsetTicks: number): void;
    setTrackGain(trackId: string, gain: number): void;
    setTrackMute(trackId: string, muted: boolean): void;

    // State
    isPlaying(): boolean;
}
```

**Scheduling Strategy**:

1. **Frame-by-Frame Scheduling**: Each animation frame, convert `currentTick` → seconds
2. **Look-Ahead Buffering**: Schedule audio 100-200ms ahead of current position
3. **Minimal Restarts**: Only recreate `AudioBufferSourceNode` on seek or track changes
4. **Drift Handling**: Compare scheduled vs. actual audio context time; reschedule if >50ms drift

**Integration Pattern**:

```typescript
// In main render loop (existing pattern)
function renderFrame() {
    const tick = playbackClock.update(performance.now());
    store.setCurrentTick(tick, 'clock');

    // NEW: Update audio to follow tick
    if (audioEngine.isPlaying()) {
        audioEngine.scheduleFromTick(tick);
    }

    // ... existing visualization rendering
}
```

**Implementation Details**:

-   **Track Sources**: Map `trackId → AudioBufferSourceNode` for active playback
-   **Gain Nodes**: Per-track gain control + master output gain
-   **Scheduling Window**: Maintain 200ms audio buffer ahead of timeline position
-   **Rate Changes**: Apply `playbackRate` on all active sources when transport rate changes

**Acceptance Criteria**:

-   Audio playback starts/stops synchronously with transport controls
-   Seeking moves audio position to match new tick immediately
-   Multiple audio tracks play simultaneously with correct relative timing
-   No audio artifacts (clicks/pops) during normal playback
-   Transport rate changes affect audio pitch (acceptable for MVP)

---

## Phase 3 – Timeline UI Integration

**Goal**: Add audio track visualization and drag interaction using existing timeline patterns.

**Visual Elements**:

1. **Audio Track Row**: Extends existing `TrackEditorRow` pattern

    - Track name, mute/solo toggles, gain slider
    - Waveform placeholder (colored bar for MVP)
    - Consistent styling with MIDI tracks

2. **Draggable Clip**: Reuse existing drag patterns from MIDI track implementation

    - Horizontal drag updates `offsetTicks`
    - Snap to quantize grid when enabled
    - Visual feedback during drag

3. **Duration Display**: Clip width represents audio duration in tick space
    - Width = `durationTicks × pixelsPerTick`
    - Trim indicators for `regionStartTick`/`regionEndTick` (future phase)

**Drag Implementation**:

```typescript
// Reuse pattern from existing MIDI track dragging
const handleDrag = useCallback(
    (deltaX: number) => {
        const deltaTicks = deltaX / pixelsPerTick;
        const newOffsetTicks = baseOffsetTicks + deltaTicks;
        const snappedTicks = quantize ? snapToGrid(newOffsetTicks) : newOffsetTicks;
        updateTrack(trackId, { offsetTicks: Math.max(0, snappedTicks) });
    },
    [trackId, baseOffsetTicks, pixelsPerTick, quantize]
);
```

**File Import Integration**:

-   Extend existing file drop handler to detect audio formats
-   Show loading spinner during decode operation
-   Error handling for unsupported formats/large files

**Acceptance Criteria**:

-   Audio files drop onto timeline and create positioned tracks
-   Dragging audio clips updates position smoothly
-   Quantize snap behavior matches MIDI track behavior
-   Audio track controls (mute/solo/gain) affect playback immediately
-   Visual feedback matches existing timeline interaction patterns

---

## Phase 4 – Export Integration

**Goal**: Include audio in video export using existing deterministic timing.

**Strategy**:

1. **Pre-Mix Audio**: Use `OfflineAudioContext` to render final mix
2. **Tick-Based Timing**: Use existing `ExportTimingSnapshot` for precise timing
3. **MediaBunny Integration**: Research and implement audio track addition

**Mix Algorithm**:

```typescript
async function renderAudioMix(
    tracks: AudioTrack[],
    timingSnapshot: ExportTimingSnapshot,
    exportRange: { startTick: number; endTick: number }
): Promise<AudioBuffer> {
    const startSec = timingSnapshot.ticksToSeconds(exportRange.startTick);
    const endSec = timingSnapshot.ticksToSeconds(exportRange.endTick);
    const duration = endSec - startSec;

    const offlineContext = new OfflineAudioContext(2, duration * 48000, 48000);

    for (const track of enabledTracks(tracks)) {
        const trackStartSec = timingSnapshot.ticksToSeconds(track.offsetTicks);
        const scheduleTime = Math.max(0, trackStartSec - startSec);
        const bufferOffset = Math.max(0, startSec - trackStartSec);

        if (scheduleTime < duration && bufferOffset < track.buffer.duration) {
            const source = offlineContext.createBufferSource();
            const gain = offlineContext.createGain();

            source.buffer = track.audioCache.audioBuffer;
            source.connect(gain);
            gain.connect(offlineContext.destination);
            gain.gain.value = track.gain * (track.mute ? 0 : 1);

            source.start(scheduleTime, bufferOffset);
        }
    }

    return await offlineContext.startRendering();
}
```

**MediaBunny Integration**:

1. **Research Phase**: Investigate MediaBunny audio capabilities
2. **Fallback Plan**: If unsupported, export separate audio file with instructions
3. **Format Support**: Target common format (MP4/AAC or WebM/Opus)

**Determinism Requirements**:

-   Same input tracks + snapshot → identical audio output
-   Export audio length exactly matches video timeline duration
-   Audio events align within ±1 video frame of visual events

**Acceptance Criteria**:

-   Exported video contains audible audio track
-   Audio timing matches visual elements within frame accuracy
-   Muted/disabled tracks excluded from mix
-   Solo behavior works correctly (only solo tracks included)
-   Export range limits apply to both audio and video consistently

---

## Phase 5 – Polish & Optimization

**Goal**: Improve performance, add quality-of-life features, and handle edge cases.

**Performance Improvements**:

-   **Lazy Loading**: Only decode audio when track added to timeline
-   **Memory Management**: Clean up unused buffers; limit total memory usage
-   **Drag Optimization**: Debounce drag updates to avoid excessive scheduling

**Quality Features**:

-   **Waveform Display**: Generate and cache visual waveform data
-   **Audio Format Support**: Support common formats (MP3, WAV, OGG, AAC)
-   **File Size Warnings**: Alert for very large files (>100MB)

**Edge Case Handling**:

-   **Sample Rate Mismatch**: Resample to consistent rate if needed
-   **Long Files**: Handle files longer than reasonable timeline (30+ minutes)
-   **Corrupt Files**: Graceful error handling and user feedback

**Accessibility**:

-   **Keyboard Navigation**: Arrow keys to nudge track position
-   **Screen Reader**: Proper ARIA labels for audio track controls
-   **Color Contrast**: Ensure waveform/clip colors meet WCAG standards

**Acceptance Criteria**:

-   Smooth 60fps performance with multiple audio tracks
-   Waveform visualization aids in precise timing alignment
-   Proper error messages for unsupported files or memory limits
-   All audio features accessible via keyboard navigation
-   No memory leaks during extended editing sessions

---

## Phase 6 – Testing & Validation

**Goal**: Comprehensive testing of audio integration without breaking existing functionality.

**Test Categories**:

1. **Unit Tests**:

    - Audio buffer decoding and caching
    - Tick-to-seconds conversion accuracy for audio
    - Track offset and region calculations
    - Audio mix rendering logic

2. **Integration Tests**:

    - Audio engine lifecycle with transport changes
    - Timeline drag interactions with audio tracks
    - Export timing accuracy (audio vs video sync)

3. **Performance Tests**:

    - Multiple simultaneous audio tracks
    - Large file handling and memory usage
    - Drag responsiveness under load

4. **Compatibility Tests**:
    - Various audio formats and sample rates
    - Different browser implementations of Web Audio API
    - Export output validation across platforms

**Acceptance Criteria**:

-   All existing tests continue to pass (no regressions)
-   Audio features achieve >90% code coverage
-   Performance benchmarks meet 60fps target with 4+ audio tracks
-   Cross-browser compatibility verified on Chrome, Firefox, Safari
-   Export sync accuracy within ±1 frame measured and verified

---

## Implementation Timeline

| Phase   | Duration  | Dependencies | Key Deliverables                                  |
| ------- | --------- | ------------ | ------------------------------------------------- |
| Phase 1 | 3-5 days  | None         | Audio track data model, store actions             |
| Phase 2 | 5-7 days  | Phase 1      | Working audio engine with tick scheduling         |
| Phase 3 | 4-6 days  | Phase 2      | UI integration, drag & drop, visual feedback      |
| Phase 4 | 7-10 days | Phase 3      | Export integration (includes MediaBunny research) |
| Phase 5 | 4-6 days  | Phase 4      | Performance optimization, waveforms, polish       |
| Phase 6 | 3-5 days  | Phase 5      | Testing, validation, documentation                |

**Total Estimated Duration**: 26-39 development days (5-8 weeks)

---

## Risk Mitigation

1. **MediaBunny Uncertainty**:

    - **Risk**: Audio muxing not supported
    - **Mitigation**: Research early in Phase 4; prepare fallback export solution

2. **Audio Sync Drift**:

    - **Risk**: Tick-to-audio conversion introduces cumulative error
    - **Mitigation**: High-precision timing, periodic drift correction

3. **Performance Impact**:

    - **Risk**: Audio processing affects visualization frame rate
    - **Mitigation**: Profile early; use Web Workers if needed

4. **Browser Compatibility**:
    - **Risk**: Web Audio API differences affect functionality
    - **Mitigation**: Progressive enhancement; fallback for older browsers

---

## Success Criteria (Definition of Done)

The audio feature is **COMPLETE** when:

1. ✅ User can import audio file and position it on timeline using tick-based dragging
2. ✅ Audio plays synchronized with visual timeline (sub-frame accuracy)
3. ✅ Multiple audio tracks play simultaneously with correct relative timing
4. ✅ Audio included in video export with deterministic timing
5. ✅ All existing MIDI and visualization functionality remains unchanged
6. ✅ Performance maintains 60fps with multiple audio tracks
7. ✅ Comprehensive test coverage for audio features
8. ✅ Documentation updated to include audio workflow

**Key Differentiators from v1**:

-   Preserves tick-based time authority throughout
-   No clock system modifications required
-   Cleaner data model with unified track types
-   More realistic implementation timeline
-   Better defined success criteria

This plan maintains architectural consistency while delivering the core audio functionality needed for the application.

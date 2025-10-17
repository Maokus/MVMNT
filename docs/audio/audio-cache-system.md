# Audio Cache System

Welcome to the audio cache system documentation! This guide introduces how MVMNT transforms raw audio into tempo-aligned feature tracks for real-time visualization and interaction.

## What is the Audio Cache System?

The audio cache system is the bridge between raw audio files and visual elements in your scene. It:

1. **Analyzes** decoded `AudioBuffer` data to extract features (spectrogram magnitudes, RMS loudness, waveform peaks)
2. **Aligns** these features to your project's tempo map for beat-synchronous playback
3. **Caches** results so scene elements can sample data without re-running expensive calculations
4. **Coordinates** analysis jobs via a scheduler that reports progress and respects cancellation

### Key Components

```
AudioBuffer (decoded audio)
    ↓
AudioFeatureAnalysis (FFT, RMS, waveform extraction)
    ↓
AudioFeatureCache (tempo-aligned feature tracks)
    ↓
Scene Elements (sample and render in real-time)
```

## Quick Start

### For Scene Element Developers

If you're building a scene element that needs audio data:

```ts
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

const trackId = this.getProperty<string>('featureTrackId');
if (!trackId) return [];

const sample = getFeatureData(this, trackId, 'spectrogram', targetTime, { smoothing: 4 });
const magnitudes = sample?.values ?? [];
```

### For Calculator Developers

If you're adding a new audio analysis feature:

```ts
// 1. Define your calculator
const myCalculator: AudioFeatureCalculator = {
    id: 'my-app.my-feature',
    version: 1,
    featureKey: 'myFeature',
    async calculate(context) {
        // Extract feature from context.audioBuffer
        // Report progress, yield periodically
        return {
            /* AudioFeatureTrack */
        };
    },
};

// 2. Register it
audioFeatureCalculatorRegistry.register(myCalculator);
```

### For Integrators

If you're working on timeline/store integration:

```ts
// Trigger analysis
const handle = sharedAudioFeatureAnalysisScheduler.schedule({
    audioBuffer: myBuffer,
    audioSourceId: 'track-123',
    globalBpm: 120,
    beatsPerBar: 4,
    windowSize: 2048,
    hopSize: 512,
    onProgress: (ratio, label) => console.log(`${label}: ${ratio * 100}%`),
});

// Wait for completion
const { cache } = await handle.promise;

// Store result
timelineStore.ingestAudioFeatureCache('track-123', cache);
```

## Architecture Overview

-   **Timeline Store** owns the cache map (`audioFeatureCaches`), per-source status entries (`audioFeatureCacheStatus`), and decoded buffers. Analysis can be retried or merged without reloading audio files.【F:src/state/timelineStore.ts†L880-L1088】

-   **Analysis Scheduler** executes registered calculators one at a time, reports progress, and honors cancellation tokens so UI flows remain responsive when users stop or restart analysis.【F:src/audio/features/audioFeatureScheduler.ts†L38-L102】【F:src/state/timelineStore.ts†L283-L375】

-   **Analysis Intent Bus** lets scene elements declare which features they need. The bus deduplicates requests, informs diagnostics tooling, and ensures multiple surfaces share the same cache entry without triggering duplicate work.【F:src/audio/features/analysisIntents.ts†L80-L133】

-   **Tempo-Aligned View Adapter** provides sampling utilities that translate timeline ticks or seconds into frame indices, handling interpolation and history lookups for smooth animations.【F:src/audio/features/tempoAlignedViewAdapter.ts†L1-L218】

## Cache Lifecycle and Storage

### Status Tracking

When an audio track is bound in the timeline, the store:

1. Persists the decoded `AudioBuffer`
2. Creates a cache status entry in `audioFeatureCacheStatus`
3. Schedules an analysis pass through the scheduler

Statuses progress through these states:

-   `idle` → initial state, no analysis started
-   `pending` → analysis job is running
-   `ready` → all feature tracks successfully generated
-   `failed` → calculator threw an error during analysis
-   `stale` → cache exists but is outdated (calculator version changed, tempo map changed, or manual invalidation)

The store records why data became stale, enabling targeted reanalysis without discarding valid feature tracks.【F:src/state/timelineStore.ts†L880-L987】【F:src/audio/features/audioFeatureTypes.ts†L113-L132】

### Cache Structure

Every cache (`AudioFeatureCache`) contains:

-   **Audio Source ID**: links back to the decoded buffer
-   **Hop Metadata**: canonical hop duration in seconds and ticks for tempo alignment
-   **Tempo Projection**: start tick, tempo map hash for verifying alignment
-   **Frame Count**: total number of analysis frames
-   **Feature Tracks**: map of feature key → `AudioFeatureTrack` (spectrogram, RMS, waveform, etc.)
-   **Analysis Parameters**: window size, hop size, FFT size, smoothing, calculator versions
-   **Analysis Profiles**: reusable parameter sets for different quality/performance trade-offs
-   **Channel Aliases**: semantic labels like "Left", "Right", "Mid" for multi-channel audio

Track metadata includes calculator IDs, versions, channel counts, and per-track configuration so downstream consumers can render results without guessing at FFT sizes or smoothing strategies.【F:src/audio/features/audioFeatureTypes.ts†L19-L111】

### Serialization

Cache serialization utilities:

-   Flatten typed arrays (`Float32Array`, `Uint8Array`) into JSON-safe payloads or external file references
-   Attach default analysis profiles automatically

These utilities ensure caches can be saved and restored without data loss.【F:src/audio/features/audioFeatureAnalysis.ts†L569-L718】

## Audio Descriptors and Channel Routing

Audio descriptors are the contract between scene elements and the cache. They describe which track, channel, and calculator output is required for a render pass.【F:src/audio/features/audioFeatureTypes.ts†L19-L58】

```ts
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';

const rmsDescriptor: AudioFeatureDescriptor = {
    featureKey: 'rms',
    calculatorId: 'mvmnt.rms',
    channel: 'Left',
};
```

### Descriptor Properties

-   **`featureKey`**: The type of feature data (e.g., `'spectrogram'`, `'rms'`, `'waveform'`)
-   **`calculatorId`**: Optional calculator identifier if multiple calculators produce the same feature key
-   **`channel`**: Accepts a zero-based index (`0`, `1`, …) or a semantic alias (`'Left'`, `'Right'`, `'Mono'`). When omitted, the descriptor resolves to the merged/mono channel.
-   **`bandIndex`**: Optional frequency band index for multi-band features like spectrograms
-   **Sampling options**: Runtime parameters such as smoothing and interpolation are supplied when sampling via
    `getFeatureData`, keeping descriptors focused on analysis identity.

### Channel Resolution

-   Channel values are normalized through the resolver: numeric indices are bounds-checked and semantic aliases (`'Left'`, `'Right'`, `'Mono'`, etc.) are matched against track metadata or cache-level aliases.【F:src/audio/features/channelResolution.ts†L1-L109】
-   When only one channel exists, leaving the channel unset resolves to the mono/merged payload.【F:src/core/scene/elements/audioFeatureUtils.ts†L45-L147】
-   Descriptor coercion utilities fill in defaults and normalize aliases or numeric strings so a surface can
    accept partial user input yet still emit deterministic analysis intents.【F:src/core/scene/elements/audioFeatureUtils.ts†L17-L147】
-   Channel resolution prefers track-specific aliases and falls back to cache aliases when necessary, keeping multi-channel caches consistent across calculators.【F:src/audio/features/channelResolution.ts†L1-L109】

### Match Keys and Deduplication

Descriptors can be grouped under a match key. Elements that request the same feature and channel share analysis work even if they originate from different UI components, reducing duplicate cache entries.【F:src/audio/features/analysisIntents.ts†L25-L67】

## Calculator Pipeline

### Overview

-   Calculators transform audio buffers into `AudioFeatureTrack` payloads. Each calculator declares an id, version, feature key, and `calculate` function that receives windowing parameters, hop size, and tempo projection metadata for the request.【F:src/audio/features/audioFeatureTypes.ts†L160-L213】
-   During analysis the system registers built-in calculators (spectrogram, RMS loudness, waveform) and invokes them sequentially. Calculators may yield periodically to avoid blocking the UI and call the provided `reportProgress` callback with frame counts for status updates.【F:src/audio/features/audioFeatureAnalysis.ts†L720-L841】
-   Results include tempo-projected metadata, channel aliases, analysis profile identifiers, and an optional serializer so tracks can be saved and restored without rerunning expensive FFT work. Registering a calculator automatically invalidates caches created with older versions to keep data aligned with the implementation.【F:src/audio/features/audioFeatureAnalysis.ts†L720-L880】【F:src/audio/features/audioFeatureRegistry.ts†L1-L36】

### Built-in Calculators

#### 1. Spectrogram Calculator (`mvmnt.spectrogram`)

-   Performs FFT analysis to extract frequency-domain magnitude data
-   Outputs decibel values per frequency bin per frame
-   Uses Hann windowing and radix-2 FFT implementation
-   Default range: -80 dB to 0 dB
-   **Format**: `float32` (frameCount × binCount)
-   **Metadata**: includes FFT size, sample rate, min/max decibels

#### 2. RMS Calculator (`mvmnt.rms`)

-   Computes root-mean-square loudness per frame
-   Mixed to mono before analysis
-   **Format**: `float32` (frameCount × 1)
-   **Use case**: volume meters, envelope followers

#### 3. Waveform Calculator (`mvmnt.waveform`)

-   Extracts min/max peaks at higher resolution (8× oversample)
-   Produces compact representation for waveform rendering
-   **Format**: `waveform-minmax` (separate min/max arrays)
-   **Use case**: timeline waveform displays, scrubbing preview

### Registering a Custom Calculator

Use the calculator registry to add bespoke features before analysis runs. The timeline store will invalidate caches that were produced with an older version of the same calculator id.

```ts
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';
import type {
    AudioFeatureCalculator,
    AudioFeatureCalculatorContext,
    AudioFeatureTrack,
} from '@audio/features/audioFeatureTypes';

const peakHoldCalculator: AudioFeatureCalculator = {
    id: 'example.peak-hold',
    version: 1,
    featureKey: 'peakHold',
    label: 'Peak Hold', // Optional UI label

    // Optional: pre-compute data shared across all frames
    prepare: async (params) => {
        // Expensive setup goes here
        return {
            /* prepared data */
        };
    },

    async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
        const { audioBuffer, hopSeconds, hopTicks, frameCount, signal } = context;
        const channelCount = audioBuffer.numberOfChannels || 1;
        const peaks = new Float32Array(frameCount * channelCount);

        for (let frame = 0; frame < frameCount; frame++) {
            // Check for cancellation
            if (signal?.aborted) {
                throw new Error('Analysis cancelled');
            }

            for (let channel = 0; channel < channelCount; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                const sampleIndex = frame * context.analysisParams.hopSize;
                peaks[frame * channelCount + channel] = Math.abs(channelData[sampleIndex] ?? 0);
            }

            // Report progress for UI updates
            context.reportProgress?.(frame + 1, frameCount);

            // Yield periodically to avoid blocking
            if (frame % 100 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        return {
            key: 'peakHold',
            calculatorId: 'example.peak-hold',
            version: 1,
            frameCount,
            channels: channelCount,
            hopSeconds,
            hopTicks,
            startTimeSeconds: 0,
            tempoProjection: context.tempoProjection,
            format: 'float32',
            data: peaks,
            channelAliases: null,
            analysisProfileId: 'default',
        };
    },

    // Optional: custom serialization
    serializeResult: (track) => ({
        /* custom JSON representation */
    }),

    // Optional: custom deserialization
    deserializeResult: (payload) => {
        /* reconstruct track from JSON */
        return null;
    },
};

// Register before analysis starts
audioFeatureCalculatorRegistry.register(peakHoldCalculator);
```

**Important**: Incrementing the `version` field automatically marks all existing caches as stale, ensuring downstream consumers always use the latest algorithm.

## Requesting and Sampling Feature Data in Scene Elements

Scene elements now declare their audio feature needs through the metadata registry. The base
`SceneElement` class subscribes to those requirements automatically whenever the bound track
changes, so renderers only have to sample data at runtime.【F:src/core/scene/elements/audioElementMetadata.ts†L1-L43】【F:src/core/scene/elements/base.ts†L73-L110】

### Basic Usage Pattern

```ts
import { SceneElement } from '@core/scene/elements/base';
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

export class AudioSpectrumElement extends SceneElement {
    protected override _buildRenderObjects(config: unknown, targetTime: number) {
        const trackId = this.getProperty<string>('featureTrackId');
        if (!trackId) return [];

        const smoothing = this.getProperty<number>('smoothing') ?? 0;
        const frame = getFeatureData(this, trackId, 'spectrogram', targetTime, { smoothing });
        if (!frame) return [];

        return frame.values.map((magnitude) => {
            // Convert magnitudes into render objects.
        });
    }
}
```

The registry ensures descriptors are deduplicated and cached once per feature, even when multiple
elements request different smoothing values at draw time.【F:src/audio/features/sceneApi.ts†L126-L199】

### Dynamic Requirements

When an element lets the user choose which feature to visualize, update subscriptions explicitly.
Use `createFeatureDescriptor` together with `syncElementFeatureIntents` so the automatic cleanup
logic still runs through the shared API surface.【F:src/audio/features/sceneApi.ts†L210-L296】

```ts
import { createFeatureDescriptor } from '@audio/features/descriptorBuilder';
import { syncElementFeatureIntents, clearFeatureData } from '@audio/features/sceneApi';

export class DynamicAudioElement extends SceneElement {
    private _descriptorKey: string | null = null;

    private _syncSubscriptions() {
        const trackId = this.getProperty<string>('featureTrackId');
        const feature = this.getProperty<string>('selectedFeature');
        if (!trackId || !feature) {
            clearFeatureData(this);
            this._descriptorKey = null;
            return;
        }

        const { descriptor } = createFeatureDescriptor({ feature });
        syncElementFeatureIntents(this, trackId, [descriptor]);
        this._descriptorKey = descriptor.featureKey;
    }
}
```

### Key Helper Functions

-   **`registerFeatureRequirements`**: Declares static feature needs for a scene element. The base
    class subscribes automatically, and requirements are deduplicated across instances.
-   **`getFeatureData`**: Samples a tempo-aligned frame for the current time, applying any runtime
    smoothing or interpolation options.
-   **`sampleFeatureFrame`**: Fetches tempo-aligned data for a descriptor and caches recent frames so
    repeated renders reuse values. Diagnostics hooks capture fallbacks when caches are missing or
    descriptors cannot be resolved to a channel.【F:src/core/scene/elements/audioFeatureUtils.ts†L126-L213】
-   **`sampleFeatureHistory`**: Retrieves multiple past frames for trail effects or historical
    analysis. Returns an array of `FeatureHistoryFrame` objects with timestamps and
    values.【F:src/utils/audioVisualization/history.ts†L1-L169】
-   **`getTempoAlignedFrame`**: Low-level adapter for range sampling and interpolation tools for
    history visualizations, peak meters, and envelope displays.【F:src/audio/features/tempoAlignedViewAdapter.ts†L1-L218】

### Sample Data Structure

When you call `sampleFeatureFrame`, you receive:

```ts
interface AudioFeatureFrameSample {
    frameIndex: number; // Integer frame index
    fractionalIndex: number; // Precise position with interpolation
    hopTicks: number; // Temporal spacing in ticks
    values: number[]; // Feature data (e.g., dB magnitudes)
    format: AudioFeatureTrackFormat; // 'float32' | 'uint8' | etc.
}
```

## Tempo Alignment and Hop Quantization

### Why Tempo Alignment Matters

Audio features are extracted at fixed time intervals (hop size), but MVMNT's timeline operates in musical ticks for beat-synchronized editing. The cache system bridges these two domains:

-   **Hop Seconds**: Physical time interval between frames (e.g., 512 samples ÷ 44100 Hz = 0.0116 seconds)
-   **Hop Ticks**: Musical interval in timeline ticks (quantized to align with tempo map)
-   **Tempo Projection**: Metadata linking the cache to a specific tempo map version

### Quantization Process

```ts
// From audioFeatureAnalysis.ts
const hopSeconds = hopSize / audioBuffer.sampleRate;
const hopTicks = quantizeHopTicks({
    hopSeconds,
    tempoMapper,
    tempoProjection: { startTick: 0, tempoMapHash },
});
```

The system:

1. Computes the physical hop duration from sample rate and hop size
2. Converts it to ticks using the current tempo mapper
3. Rounds to the nearest tick for grid alignment
4. Stores both values so sampling can work in either domain

When the tempo map changes, caches become `stale` and must be reanalyzed to maintain alignment.【F:src/audio/features/hopQuantization.ts†L1-L42】

### Interpolation Strategies

The view adapter supports three interpolation modes:

-   **`hold`**: Nearest-neighbor, no blending (snappy, quantized feel)
-   **`linear`**: Linear interpolation between adjacent frames (smooth, default)
-   **`spline`**: Cubic spline interpolation (smoothest, slight computational overhead)

## FFT Implementation

The built-in spectrogram calculator uses a custom radix-2 FFT implementation optimized for Web Audio contexts:

### Key Features

-   **Radix-2 Cooley-Tukey algorithm**: Requires power-of-two sizes, highly efficient
-   **In-place computation**: Minimizes memory allocation during analysis
-   **Hann windowing**: Reduces spectral leakage, smooth frequency transitions
-   **Decibel conversion**: Outputs calibrated dB values for perceptual accuracy

### FFT Plan Caching

```ts
// From audioFeatureAnalysis.ts
const fftPlan = createFftPlan(fftSize);
// Plan contains pre-computed twiddle factors for all stages
```

Plans are created once per analysis pass and reused across all frames, avoiding redundant trigonometric calculations.【F:src/audio/features/fft.ts†L1-L75】

## Tooling, Diagnostics, and UI Integration

### UI Components

-   **Audio Feature Descriptor Input**: Form control that surfaces available tracks from the store, enforces unique descriptors, and links selections to compatible analysis profiles so authors cannot request a calculator with incompatible parameters.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L237-L520】

-   **Scene Analysis Caches Panel**: Lists cache states, progress, and controls for restarting or reanalyzing individual calculators, respecting whether buffers are available and if jobs are already running.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L91-L200】

### Diagnostics System

-   Diagnostics state subscribes to the intent bus, records job history, and coordinates regeneration actions. When a descriptor is published for a track with stale data, the diagnostics store prompts the user to re-run the necessary calculators.【F:src/state/audioDiagnosticsStore.ts†L520-L635】

-   Tracks fallback reasons when sampling fails (missing cache, invalid descriptor, out-of-bounds time)
-   Records tempo alignment mismatches and interpolation performance
-   Provides real-time progress updates during analysis

## Common Workflows

### Workflow 1: Adding Audio-Reactive Element

**Goal**: Create a scene element that visualizes audio frequency data

```ts
// 1. In your element's config schema, add audio properties
{
    key: 'audioTrackId',
    type: 'timelineTrackRef',
    label: 'Audio Track',
    default: null,
    allowedTrackTypes: ['audio'],
}

// 2. In _buildRenderObjects, request spectrogram data
const trackId = this.getProperty<string>('audioTrackId');
const descriptor = {
    featureKey: 'spectrogram',
    channel: 'Left',
    smoothing: 0.2
};

emitAnalysisIntent(this, trackId, 'default', [descriptor]);
const sample = sampleFeatureFrame(trackId, descriptor, targetTime);

// 3. Map frequency bins to visual elements
if (sample?.values) {
    return sample.values.map((magnitude, binIndex) => {
        const height = magnitude * 100; // Convert dB to pixel height
        return new Rectangle(binIndex * 10, 0, 8, height, '#00ff00');
    });
}
```

### Workflow 2: Multi-Channel Visualization

**Goal**: Show left and right channels separately

```ts
const descriptors = [
    { featureKey: 'rms', channel: 'Left' },
    { featureKey: 'rms', channel: 'Right' },
];

emitAnalysisIntent(this, trackId, 'default', descriptors);

const leftSample = sampleFeatureFrame(trackId, descriptors[0], targetTime);
const rightSample = sampleFeatureFrame(trackId, descriptors[1], targetTime);

// Render side-by-side bars
const leftHeight = (leftSample?.values[0] ?? 0) * 200;
const rightHeight = (rightSample?.values[0] ?? 0) * 200;
```

### Workflow 3: History/Trail Effects

**Goal**: Create motion trails based on past audio data

```ts
import { sampleFeatureHistory } from '@utils/audioVisualization/history';

// Get last 8 frames with equal spacing
const history = sampleFeatureHistory(
    trackId,
    descriptor,
    targetTime,
    8,
    { type: 'equalSpacing', seconds: 0.05 } // 50ms between frames
);

// Render with fading opacity
return history.map((frame, index) => {
    const opacity = (index + 1) / history.length; // Fade in
    const magnitude = frame.values[0] ?? 0;
    const height = magnitude * 100;
    return new Rectangle(0, 0, 50, height, `rgba(255, 255, 255, ${opacity})`);
});
```

### Workflow 4: Custom Analysis Feature

**Goal**: Add a zero-crossing rate calculator

```ts
import { audioFeatureCalculatorRegistry } from '@audio/features/audioFeatureRegistry';

const zeroCrossingCalculator: AudioFeatureCalculator = {
    id: 'custom.zero-crossing',
    version: 1,
    featureKey: 'zeroCrossing',
    label: 'Zero Crossing Rate',

    async calculate(context) {
        const { audioBuffer, hopSize, frameCount, signal } = context;
        const channelData = audioBuffer.getChannelData(0);
        const rates = new Float32Array(frameCount);

        for (let frame = 0; frame < frameCount; frame++) {
            if (signal?.aborted) throw new Error('Cancelled');

            const start = frame * hopSize;
            const end = Math.min(start + hopSize, channelData.length);
            let crossings = 0;

            for (let i = start + 1; i < end; i++) {
                if (
                    (channelData[i - 1] >= 0 && channelData[i] < 0) ||
                    (channelData[i - 1] < 0 && channelData[i] >= 0)
                ) {
                    crossings++;
                }
            }

            rates[frame] = crossings / hopSize; // Normalized rate
            context.reportProgress?.(frame + 1, frameCount);
        }

        return {
            key: 'zeroCrossing',
            calculatorId: 'custom.zero-crossing',
            version: 1,
            frameCount,
            channels: 1,
            hopSeconds: context.hopSeconds,
            hopTicks: context.hopTicks,
            startTimeSeconds: 0,
            tempoProjection: context.tempoProjection,
            format: 'float32',
            data: rates,
            channelAliases: ['Mono'],
            analysisProfileId: 'default',
        };
    },
};

// Register before loading audio
audioFeatureCalculatorRegistry.register(zeroCrossingCalculator);
```

### Workflow 5: Manual Cache Management

**Goal**: Trigger reanalysis when user changes settings

```ts
import { useTimelineStore } from '@state/timelineStore';

function handleQualityChange(newFftSize: number) {
    const store = useTimelineStore.getState();
    const audioSourceId = 'my-audio-source-id';

    // Clear existing cache
    store.clearAudioFeatureCache(audioSourceId);

    // Trigger new analysis with updated parameters
    // (Will happen automatically when scene elements emit intents)
}

// Or reanalyze just one calculator
function reanalyzeSpectrum() {
    const store = useTimelineStore.getState();
    store.reanalyzeAudioFeatureCalculators(audioSourceId, ['mvmnt.spectrogram']);
}
```

## Testing and Validation

### Test Coverage

The audio cache system includes comprehensive test suites:

-   **Analysis Integration Tests**: Verify end-to-end calculator execution, progress reporting, and cache generation
-   **FFT Correctness**: Validate frequency-domain transforms against known signals
-   **Tempo Alignment**: Test quantization and interpolation across different tempo maps
-   **Serialization Round-trips**: Ensure caches survive save/load cycles without data loss

Location: `src/audio/__tests__/`

### Manual Testing Workflow

1. **Load audio file** into timeline
2. **Verify analysis** triggers automatically (check status panel)
3. **Add spectrum element** to scene, bind to audio track
4. **Check descriptor form** shows available features
5. **Play timeline**, ensure real-time sampling works
6. **Change tempo map**, verify cache marked stale
7. **Reanalyze**, confirm new alignment

### Common Issues

| Symptom                     | Likely Cause                   | Solution                                                         |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| No visualization            | Cache not ready                | Check status panel, wait for analysis                            |
| Stale cache warning         | Tempo map changed              | Click "Reanalyze" in diagnostics panel                           |
| Incorrect frequency mapping | FFT size mismatch              | Review calculator metadata, ensure descriptor uses correct track |
| Poor performance            | Large cache retained in memory | Clear unused caches via store action                             |

## Extending and Maintaining the System

### Adding New Calculators

1. **Implement** `AudioFeatureCalculator` interface
2. **Register** before analysis: `audioFeatureCalculatorRegistry.register(myCalculator)`
3. **Version** carefully: incrementing triggers cache invalidation
4. **Test** with various audio formats and edge cases

New calculators automatically:

-   Appear in UI selector dropdowns
-   Participate in the shared cache lifecycle
-   Trigger diagnostics tracking
-   Support serialization (if you provide serializers)

### Programmatic Cache Management

```ts
import { useTimelineStore } from '@state/timelineStore';

const store = useTimelineStore.getState();

// Reanalyze specific calculators for a track
store.reanalyzeAudioFeatureCalculators(audioSourceId, ['mvmnt.spectrogram']);

// Clear entire cache (forces full reanalysis)
store.clearAudioFeatureCache(audioSourceId);

// Invalidate caches from a specific calculator version
store.invalidateAudioFeatureCachesByCalculator('custom.calculator', 2);

// Ingest external cache (e.g., from background worker)
store.ingestAudioFeatureCache(audioSourceId, externalCache);
```

Targeted reanalysis merges new tracks into existing caches, preserving valid data from other calculators. This keeps interactive edits fast without discarding expensive calculations.【F:src/state/timelineStore.ts†L1008-L1071】

### Best Practices

-   **Always use descriptors**: Channel feature requests through the intent bus so diagnostics, cache invalidation, and tempo-aligned sampling remain in sync across the app
-   **Yield during analysis**: Call `await maybeYield()` every ~100 frames to keep UI responsive
-   **Report progress**: Invoke `context.reportProgress(processed, total)` for status updates
-   **Handle cancellation**: Check `signal?.aborted` and throw abort errors when needed
-   **Version carefully**: Increment calculator versions only when output format or algorithm changes materially
-   **Profile performance**: Large FFT sizes (>4096) can block the main thread; consider Web Workers for heavy analysis

## Performance Considerations

### Memory Usage

**Cache Size Estimates**:

-   **Spectrogram** (2048 FFT, 512 hop, 3 min audio @ 44.1kHz):
    -   Frame count: ~15,500 frames
    -   Bin count: 1025 bins
    -   Total: 15,500 × 1025 × 4 bytes ≈ **63 MB**
-   **RMS** (same audio):
    -   15,500 × 1 × 4 bytes ≈ **62 KB**

**Optimization Strategies**:

-   Use smaller FFT sizes (1024 instead of 4096) when high resolution isn't needed
-   Increase hop size for lower temporal resolution
-   Clear unused caches when switching projects: `store.clearAudioFeatureCache(id)`
-   Consider `uint8` format for features that don't need float32 precision

### Computational Cost

**FFT Complexity**: O(N log N) per frame, where N = FFT size

-   1024 FFT: ~10 operations per sample
-   4096 FFT: ~48 operations per sample

**Analysis Time (approximate)**:

-   3-minute audio, 2048 FFT, 512 hop: **1-2 seconds** (desktop)
-   Same with 4096 FFT: **3-5 seconds**

**Yielding Strategy**:

```ts
const YIELD_INTERVAL = 100; // frames

for (let frame = 0; frame < frameCount; frame++) {
    // Process frame...

    if (frame % YIELD_INTERVAL === 0) {
        await maybeYield(); // Release main thread
    }
}
```

### Sampling Performance

-   **Frame cache**: Recent samples cached per track (max 128 entries)
-   **Cache hit rate**: Typically >95% during playback
-   **Cold sampling**: ~0.1ms per frame (includes interpolation)
-   **Warm sampling**: ~0.01ms (cached)

**Optimization Tips**:

-   Reuse descriptors across elements to share cache entries
-   Batch sampling when possible (use `sampleFeatureHistory` instead of multiple `sampleFeatureFrame` calls)
-   Prefer `hold` interpolation for real-time displays (faster than `linear` or `spline`)

## Glossary

| Term                 | Definition                                                               |
| -------------------- | ------------------------------------------------------------------------ |
| **Audio Buffer**     | Decoded PCM audio data in Web Audio API format                           |
| **Analysis Profile** | Preset configuration of window size, hop size, FFT parameters            |
| **Calculator**       | Module that transforms audio into a specific feature track               |
| **Channel Alias**    | Semantic label like "Left", "Right", "Mid" for multi-channel routing     |
| **Descriptor**       | Query specification: which feature, channel, smoothing to sample         |
| **Feature Track**    | Time-series array of analysis results (e.g., spectrogram frames)         |
| **FFT**              | Fast Fourier Transform: converts time-domain audio to frequency spectrum |
| **Frame**            | Single time slice of analysis data at one hop interval                   |
| **Hop Size**         | Sample distance between consecutive analysis windows                     |
| **Hop Ticks**        | Hop duration in musical timeline ticks                                   |
| **Intent Bus**       | Pub/sub system for declaring feature data dependencies                   |
| **Tempo Projection** | Metadata linking cache to specific tempo map version                     |
| **Window Size**      | Number of audio samples analyzed per FFT frame                           |

## Further Reading

-   **FFT Theory**: [Understanding the FFT Algorithm](https://www.dspguide.com/)
-   **Audio Features**: [Essentia Audio Analysis Documentation](https://essentia.upf.edu/)
-   **Tempo Mapping**: See `docs/time-domain.md` for MVMNT's tick system
-   **Scene Elements**: See `docs/architecture.md` for rendering pipeline

## Troubleshooting

### Cache Not Updating After Code Change

**Problem**: Modified calculator code but old data still renders

**Solution**:

1. Increment calculator `version` number
2. Reload page to trigger automatic invalidation
3. Check diagnostics panel shows "stale" status

### Out of Memory During Analysis

**Problem**: Browser crashes or slows during long audio analysis

**Solution**:

-   Reduce FFT size (e.g., 2048 → 1024)
-   Increase hop size (e.g., 512 → 1024)
-   Process audio in chunks with yielding
-   Clear old caches before analyzing new files

### Incorrect Frequency Mapping

**Problem**: Spectrum visualization doesn't match expected frequencies

**Solution**:

1. Check `metadata.sampleRate` matches actual audio file
2. Verify FFT size in track metadata: `track.metadata.fftSize`
3. Ensure descriptor uses correct `bandIndex` for specific frequencies
4. Use frequency = (binIndex × sampleRate) / fftSize

### Tempo Misalignment

**Problem**: Audio reactive elements drift out of sync with beats

**Solution**:

1. Check cache status: should be "ready", not "stale"
2. Verify tempo map hash matches current timeline
3. Reanalyze cache after changing tempo: `store.reanalyzeAudioFeatureCalculators(id, calculatorIds)`
4. Confirm `hopTicks` are quantized correctly in cache metadata

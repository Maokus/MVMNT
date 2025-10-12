# Audio cache system

## Architecture overview
- The audio cache converts decoded `AudioBuffer` data into tempo-aware feature tracks that power the
  timeline, diagnostics tools, and runtime scene elements. The timeline store owns the cache map,
  per-source status, and decoded buffers so analysis can be retried or merged without reloading audio
  files.【F:src/state/timelineStore.ts†L880-L1088】
- Analysis jobs are scheduled through a shared worker that executes registered calculators one at a
  time, reports progress, and honours cancellation tokens so UI flows remain responsive when a user
  stops a run.【F:src/audio/features/audioFeatureScheduler.ts†L38-L102】【F:src/state/timelineStore.ts†L283-L375】
- Scene elements describe the feature data they need via analysis intents. The intent bus
  deduplicates requests, informs diagnostics tooling, and allows multiple surfaces to share the same
  cache entry without triggering duplicate analysis work.【F:src/audio/features/analysisIntents.ts†L80-L133】

## Cache lifecycle and storage
- When an audio track is bound in the timeline, the store persists the decoded buffer, creates a
  cache status entry, and schedules an analysis pass. Statuses progress from `idle` to `pending` and
  then to `ready`, or `failed` if the calculators throw an error. Reanalysis marks caches as `stale`
  and records why the previous data is obsolete.【F:src/state/timelineStore.ts†L880-L987】【F:src/audio/features/audioFeatureTypes.ts†L113-L132】
- Every cache records canonical hop duration, tempo projection, and analysis parameters alongside the
  generated feature tracks. Track metadata stores calculator identifiers, channel counts, aliases,
  and optional per-track window configuration so downstream consumers can render results without
  guessing at FFT sizes or smoothing strategies.【F:src/audio/features/audioFeatureTypes.ts†L19-L111】
- Cache serialization utilities flatten typed arrays into JSON-safe payloads, attach default analysis
  profiles, and migrate legacy caches forward so saved projects stay compatible with the current
  runtime.【F:src/audio/features/audioFeatureAnalysis.ts†L569-L718】

## Audio descriptors and channel routing
Audio descriptors are the contract between scene elements and the cache. They describe which track,
channel, and calculator output is required for a render pass.【F:src/audio/features/audioFeatureTypes.ts†L19-L58】

```ts
import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';

const rmsDescriptor: AudioFeatureDescriptor = {
    featureKey: 'rms',
    calculatorId: 'mvmnt.rms',
    channelAlias: 'L',
    smoothing: 0.25,
};
```

- `channelIndex` explicitly chooses a zero-based channel. `channelAlias` lets descriptors follow
  semantic labels (`L`, `R`, `Mid`) that are resolved against track metadata or cache-level aliases.
  When only one channel exists, the helpers leave the channel unset and the calculators fall back to
  mono processing.【F:src/audio/features/audioFeatureTypes.ts†L25-L48】【F:src/core/scene/elements/audioFeatureUtils.ts†L79-L146】
- Descriptor coercion utilities fill in defaults, merge smoothing hints, and map aliases to concrete
  indices so a surface can accept partial user input yet still emit deterministic analysis intents.
  Channel resolution prefers track-specific aliases and falls back to cache aliases when necessary,
  keeping multi-channel caches consistent across calculators.【F:src/core/scene/elements/audioFeatureUtils.ts†L45-L164】
- Descriptors can be grouped under a match key. Elements that request the same feature and channel
  share analysis work even if they originate from different UI components, reducing duplicate cache
  entries.【F:src/audio/features/analysisIntents.ts†L25-L67】

## Calculator pipeline
- Calculators transform audio buffers into `AudioFeatureTrack` payloads. Each calculator declares an
  id, version, feature key, and `calculate` function that receives windowing parameters, hop size, and
  tempo projection metadata for the request.【F:src/audio/features/audioFeatureTypes.ts†L160-L213】
- During analysis the system registers built-in calculators (spectrogram, RMS loudness, waveform) and
  invokes them sequentially. Calculators may yield periodically to avoid blocking the UI and call the
  provided `reportProgress` callback with frame counts for status updates.【F:src/audio/features/audioFeatureAnalysis.ts†L720-L841】
- Results include tempo-projected metadata, channel aliases, analysis profile identifiers, and an
  optional serializer so tracks can be saved and restored without rerunning expensive FFT work.
  Registering a calculator automatically invalidates caches created with older versions to keep data
  aligned with the implementation.【F:src/audio/features/audioFeatureAnalysis.ts†L720-L880】【F:src/audio/features/audioFeatureRegistry.ts†L1-L36】

### Registering a custom calculator
Use the calculator registry to add bespoke features before analysis runs. The timeline store will
invalidate caches that were produced with an older version of the same calculator id.

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
    async calculate(context: AudioFeatureCalculatorContext): Promise<AudioFeatureTrack> {
        const { audioBuffer, hopSeconds, hopTicks, frameCount } = context;
        const channelCount = audioBuffer.numberOfChannels || 1;
        const peaks = new Float32Array(frameCount * channelCount);
        for (let frame = 0; frame < frameCount; frame++) {
            for (let channel = 0; channel < channelCount; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                const sampleIndex = frame * context.analysisParams.hopSize;
                peaks[frame * channelCount + channel] = Math.abs(channelData[sampleIndex] ?? 0);
            }
            context.reportProgress?.(frame + 1, frameCount);
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
            format: 'float32',
            data: peaks,
            channelAliases: null,
        };
    },
};

audioFeatureCalculatorRegistry.register(peakHoldCalculator);
```

## Requesting and sampling feature data in scene elements
Scene elements rely on helpers that publish intents, resolve channel aliases, and sample tempo-aligned
frames from caches.【F:src/core/scene/elements/audioFeatureUtils.ts†L1-L205】

```ts
import { useEffect, useMemo } from 'react';
import {
    coerceFeatureDescriptors,
    emitAnalysisIntent,
    resolveDescriptorChannelIndex,
    sampleFeatureFrame,
} from '@core/scene/elements/audioFeatureUtils';

function useSpectrumFeature(element: { id: string | null; type: string }, trackRef: string | null) {
    const descriptors = useMemo(
        () => coerceFeatureDescriptors({ featureKey: 'spectrogram' }, { featureKey: 'spectrogram' }),
        [],
    );

    useEffect(() => {
        emitAnalysisIntent(element, trackRef, 'default', descriptors);
        return () => emitAnalysisIntent(element, null, null, []);
    }, [element, trackRef, descriptors]);

    return (timeSeconds: number) => {
        const descriptor = descriptors[0];
        const channelIndex = resolveDescriptorChannelIndex(trackRef, descriptor);
        return sampleFeatureFrame(trackRef!, { ...descriptor, channelIndex }, timeSeconds);
    };
}
```

- `emitAnalysisIntent` notifies the bus when an element binds to a track and needs feature data. The
  bus deduplicates descriptors, and diagnostics subscribers enqueue reanalysis when caches are stale.
  Clearing the intent when an element unmounts keeps the dependency graph accurate.【F:src/audio/features/analysisIntents.ts†L80-L133】【F:src/state/audioDiagnosticsStore.ts†L520-L635】
- `sampleFeatureFrame` fetches tempo-aligned data for the requested descriptor, caching recent
  samples per track so repeated renders reuse values. Diagnostics hooks capture fallbacks when caches
  are missing or descriptors cannot be resolved to a channel.【F:src/core/scene/elements/audioFeatureUtils.ts†L147-L213】
- Additional utilities such as `getTempoAlignedFrame` provide range sampling and interpolation tools
  for history visualisations, peak meters, and envelope displays.【F:src/audio/features/tempoAlignedViewAdapter.ts†L1-L218】【F:src/utils/audioVisualization/history.ts†L1-L169】

## Tooling, diagnostics, and UI integration
- The Audio Feature Descriptor input form surfaces available tracks from the store, enforces unique
  descriptors, and links selections to compatible analysis profiles so authors cannot request a
  calculator with incompatible parameters.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L237-L520】
- The Scene Analysis Caches panel lists cache states, progress, and controls for restarting or
  reanalysing individual calculators, respecting whether buffers are available and if jobs are already
  running.【F:src/workspace/layout/SceneAnalysisCachesTab.tsx†L91-L200】
- Diagnostics state subscribes to the intent bus, records job history, and coordinates regeneration
  actions. When a descriptor is published for a track with stale data, the diagnostics store prompts
  the user to re-run the necessary calculators.【F:src/state/audioDiagnosticsStore.ts†L520-L635】

## Extending and maintaining the system
- Register calculators before scheduling analysis so new feature keys appear in selector UIs and
  scene elements. Updating a calculator version will automatically mark affected caches as stale and
  queue reanalysis when intents arrive.【F:src/audio/features/audioFeatureAnalysis.ts†L720-L880】【F:src/audio/features/audioFeatureRegistry.ts†L1-L36】
- Reanalyse buffers programmatically through the timeline store. Restart operations ensure buffers
  exist, while targeted runs merge new tracks into the cache so other feature payloads remain valid.
  This keeps interactive edits fast without discarding expensive calculations.【F:src/state/timelineStore.ts†L1008-L1071】
- When adding new scene surfaces, always channel feature requests through descriptors and the intent
  bus so diagnostics, cache invalidation, and tempo-aligned sampling remain in sync across the app.

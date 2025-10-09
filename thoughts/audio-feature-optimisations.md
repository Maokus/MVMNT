# Audio Feature Optimisations

Status: Open Questions

## Tick/Second Conversion Touchpoints

### Oscilloscope Sampling
- The oscilloscope panel derives its render window by converting the target time plus offsets into ticks for the sampling request, issuing three separate `secondsToTicks` calls for the target, start, and end timestamps before delegating to `sampleAudioFeatureRange`.【F:src/core/scene/elements/audio-oscilloscope.ts†L163-L179】
- Debug overlays reverse the process by converting ticks back into seconds for the playhead, nearest frame, and requested window, repeating `ticksToSeconds` work that other feature adapters have already performed.【F:src/core/scene/elements/audio-oscilloscope.ts†L247-L305】

### Tempo-Aligned Feature Adapter
- Both frame and range fetchers resolve hop sizes by rounding `tempoMapper.secondsToTicks(hopSeconds)` when cached projections are missing, duplicating the same quantisation logic used elsewhere.【F:src/audio/features/tempoAlignedViewAdapter.ts†L126-L153】【F:src/audio/features/tempoAlignedViewAdapter.ts†L385-L445】
- Range sampling converts request ticks to seconds and back to ticks per frame, meaning each returned frame performs a full `secondsToTicks` conversion even though hop spacing is uniform.【F:src/audio/features/tempoAlignedViewAdapter.ts†L615-L669】

### Feature Analysis Pipeline
- The waveform calculator quantises its oversampled hop in ticks using `tempoMapper.secondsToTicks`, mirroring the adapter logic but without sharing helpers.【F:src/audio/features/audioFeatureAnalysis.ts†L728-L792】
- During analysis setup, the pipeline quantises the global hop seconds to ticks for cache metadata and clones tempo projections for each calculator output.【F:src/audio/features/audioFeatureAnalysis.ts†L820-L860】
- An internal `resolveHopTicks` fallback multiplies hop seconds by a hard-coded 960 PPQ when projections are absent, diverging from the tempo-aware conversions used elsewhere.【F:src/audio/features/audioFeatureAnalysis.ts†L303-L312】

## Redundancy and Inconsistency Observations
- `Math.max(1, Math.round(tempoMapper.secondsToTicks(...)))` appears in the oscilloscope’s upstream adapter and the analysis calculators, but each site owns its own helper, increasing drift risk when PPQ or tempo behaviour evolves.【F:src/audio/features/tempoAlignedViewAdapter.ts†L126-L153】【F:src/audio/features/audioFeatureAnalysis.ts†L728-L792】
- The analysis fallback that assumes 960 ticks per quarter conflicts with the tempo-aligned adapter, which always consults the shared tempo mapper. Mixing these code paths can yield mismatched hop ticks for the same track depending on where it was hydrated.【F:src/audio/features/audioFeatureAnalysis.ts†L303-L312】【F:src/audio/features/tempoAlignedViewAdapter.ts†L126-L153】
- Oscilloscope debug UI recomputes seconds from ticks even though the tempo-aligned adapter already had to perform that work to populate `frameTicks`, leading to duplicate conversions each frame.【F:src/core/scene/elements/audio-oscilloscope.ts†L247-L305】【F:src/audio/features/tempoAlignedViewAdapter.ts†L615-L669】

## Proposed Consolidation
- Introduce a shared `quantizeHop` utility (e.g., under `@audio/features`) that accepts hop seconds, tempo projections, and the active tempo mapper to produce canonical hop ticks. Both the analysis pipeline and tempo-aligned adapter could import this helper, ensuring a single rounding rule and eliminating the 960-PPQ fallback.【F:src/audio/features/audioFeatureAnalysis.ts†L303-L312】【F:src/audio/features/tempoAlignedViewAdapter.ts†L126-L153】
- Extend `TempoAlignedRangeSample` with optional `frameSeconds` metadata (or expose a helper that decorates ticks with seconds) so UI layers such as the oscilloscope can display debug information without re-deriving conversions. This keeps timing transformations inside the adapter that already has the mapper instance.【F:src/audio/features/tempoAlignedViewAdapter.ts†L615-L669】【F:src/core/scene/elements/audio-oscilloscope.ts†L247-L305】
- When constructing the feature cache, persist the computed hop tick quantisation alongside `hopSeconds` so downstream consumers do not need to recompute it repeatedly. This metadata already exists on the cache object and can be treated as authoritative once the shared helper is in place.【F:src/audio/features/audioFeatureAnalysis.ts†L820-L860】

## Additional Optimisation Opportunities
- `getTempoAlignedRange` converts every frame’s centre time back to ticks inside a loop. Switching to `tempoMapper.secondsToTicksBatch` or accumulating offsets from the first frame would reduce mapper calls for dense waveforms and spectrograms.【F:src/audio/features/tempoAlignedViewAdapter.ts†L615-L669】
- The oscilloscope currently issues new `secondsToTicks` conversions on every render pass. Memoising the converted window (e.g., by caching `[targetTime, offset] → tick window` per frame) would avoid redundant conversions when layout parameters are unchanged.【F:src/core/scene/elements/audio-oscilloscope.ts†L163-L205】
- `analyzeAudioBufferFeatures` creates a `timingContext` snapshot that is never read, so we can either remove the allocation or reuse it to provide the shared conversion helper during calculator execution, reducing setup overhead.【F:src/audio/features/audioFeatureAnalysis.ts†L833-L860】
- During waveform analysis, each frame scans the mono buffer sequentially; leveraging typed-array min/max helpers or WebAssembly-style vector reductions could accelerate large files once the conversion helpers are shared, especially if hop ticks are already memoised.【F:src/audio/features/audioFeatureAnalysis.ts†L728-L792】

## Next Steps
- Validate that consolidating hop quantisation does not break legacy caches by adding targeted regression tests around tempo map changes.
- Prototype a batch conversion path in the tempo-aligned adapter and benchmark its impact on oscilloscope redraw latency.

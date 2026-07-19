# Transient display plugin notes

_Last reviewed: July 2026_

## What the element needs

The transient display uses two intentionally separate audio paths:

- A custom feature calculator emits only transient markers. Its output is compact, cacheable,
  and suitable for looking ahead to the next trigger.
- The render method reads raw mono PCM for the actual waveform. It preserves waveform detail that
  would be lost at the calculator hop rate.

The renderer treats all state as a function of `targetTime`, cached feature data, and PCM. This
makes scrubbing and export deterministic. In overwrite mode, the retained trace is reconstructed
from the preceding transient on every render rather than mutating a frame buffer.

## Useful SDK capabilities

The current plugin SDK provides the core pieces needed for this design:

- `audioCalculatorsApi.register()` allows a custom calculator to join the shared analysis cache.
- `registerFeatureRequirements()` starts the needed analysis automatically for an element type.
- `sampleFeatureRange()` supports trigger look-ahead without repeated single-frame calls.
- `getRawSamples()` gives accurate PCM in timeline coordinates.
- The timing conversion API converts between seconds, ticks, and beats for beat/bar fallbacks.

## Friction points noticed

### Feature samples lack an explicit source timestamp

`FeatureDataResult` exposes a frame index, fractional index, and hop ticks, but it does not expose
the exact timeline timestamp represented by that frame. A moving range query therefore cannot use
its request-grid time as a stable trigger position: it can make a transient appear to drift by one
or more display frames. The element reconstructs an anchored time from the frame metadata and the
timing API.

An explicit `timeSeconds` (and, ideally, source time) on feature samples would make trigger-based
elements simpler and less error-prone.

### Range results omit request times

`sampleFeatureRange()` returns values but not the timestamp for each returned sample. Consumers
must infer it from `startTime + index * stepSec`, which is not reliable if unavailable frames are
skipped. Returning `{ time, result }` pairs would remove this ambiguity.

### Raw PCM has a fixed request cap

`getRawSamples()` rejects requests over `MAX_RAW_SAMPLES`. A beat or bar can easily exceed that
limit, so this plugin fetches a display interval in small chunks and reduces each chunk to waveform
buckets. A ranged PCM iterator or an envelope API backed by PCM would reduce per-frame allocation
and host calls for long beat/bar displays.

### Time-signature data is not available through the timing API

The public timing API converts beats and ticks but does not expose the active beats-per-bar value.
The element therefore exposes `Beats per Bar` as a property, defaulting to 4. Exposing the current
time signature would let beat/bar-driven elements follow timeline changes without duplicate user
configuration.

### Feature requirements are keyed by a string element type

`registerFeatureRequirements()` requires the element type string separately from the class. The
string must match the manifest and the `SceneElement` constructor exactly, which is easy to mistype
in a third-party plugin. A typed registration helper tied to an element constructor or manifest
entry would make this relationship safer.

## Recommendations

- Add stable timeline/source timestamps to `FeatureDataResult` and range-result entries.
- Offer a bounded, allocation-conscious PCM range/envelope API for visualisers.
- Expose time-signature metadata from the timing capability.
- Provide typed helpers that associate feature requirements with a registered element definition.

# Plugin API capabilities tour

This guide follows the [quickstart](quickstart.md). It tours the most useful SDK capabilities and a
few helpers without building a large plugin. Treat the snippets as ideas to add to a simple
random-access `render({ props, time, context })` callback.

## Capabilities are explicit permissions

An element lists the host services it uses in its `plugin.json` entry:

```json
"capabilities": {
    "required": ["timeline.read"],
    "optional": ["timing.conversion", "midi.utils"]
}
```

Use `required` when the element has no meaningful output without a service. MVMNT will not load the
element if that service is unavailable. Use `optional` for an enhancement and check that its
context facet exists before calling it:

```ts
const noteLabel = context.midi ? context.midi.noteName(60) : '60';
```

All host reads return a `Result`. An unsuccessful result is often temporary or expected, so render
a fallback rather than throwing.

## Explore the timeline

Declare `timeline.read` to inspect timeline metadata, tracks, MIDI notes, control changes, and the
sustain pedal. Reads are clip-aware and use timeline seconds, so plugins do not need to reconstruct
clip offsets.

```ts
const metadata = context.timeline!.getMetadata();
if (metadata.ok) {
    const progress = time.seconds / Math.max(metadata.value.durationSeconds, 0.001);
    // Use progress to move a playhead or fill a progress bar.
}
```

Other useful reads include:

- `getTracks()` to make a legend or summarize the available tracks.
- `getTrack(trackId)` to display a selected track's name or colour.
- `selectNotes()` to draw active notes, a piano roll, falling notes, or chord shapes.
- `selectCC()` to react to modulation, expression, or any MIDI controller.
- `getSustain()` to keep a visual lit while the sustain pedal is down.

Ask only for the time window needed by the current visual. For example, a two-second look-ahead for
a scrolling piano roll is enough:

```ts
if (!props.midiTrackId) return [];

const upcoming = context.timeline!.selectNotes({
    trackIds: [props.midiTrackId],
    startSeconds: time.seconds,
    endSeconds: time.seconds + 2,
});
```

Each note includes its pitch, channel, optional velocity, start, end, and duration. `selectCC()`
similarly returns controller number, value, channel, and time.

With no IDs, `getTracks()` returns all supported MIDI and audio tracks in timeline order. Metadata's
playback start/end fields reflect the active playback braces rather than an assumed zero-to-duration
range.

## Choose the right audio read

MVMNT offers raw audio and analyzed features. They solve different problems.

### Raw audio

Declare `audio.raw.read` when individual PCM samples matter. Possible uses include a short
oscilloscope trace, a zero-crossing detector, or a custom transient experiment.

```ts
const samples = context.audio!.getRawSamples({
    trackId: props.audioTrackId,
    startSeconds: Math.max(0, time.seconds - 0.02),
    endSeconds: time.seconds + 0.02,
    channel: 'mono',
});
```

`getChannelMetadata()` reports sample rate, channel count, duration, and labels. `getRms()` is a
convenient raw-audio read for volume meters and audio-driven scale when the individual samples are
not needed. Raw reads allocate defensive copies, so keep their windows short.

### Analyzed features

Declare `audio.features.read` for cached musical or frequency information. The built-in features
are `spectrogram`, `peaks`, and `pitchGuide`. An element also declares its complete requirements
with `audioFeatureDemands(props)` so MVMNT can prepare the cache.

Use:

- `sampleFeature()` for one value at the current time.
- `sampleFeatureRange()` for a modest sequence, such as a short history graph.
- `sampleFeatureMatrix()` for a dense, packed window used by a spectrogram or generated raster.

The [audio guide](audio.md) explains demands, smoothing, matrices, and custom calculators when you
are ready to build a fuller audio visualization.

## Work in seconds, beats, or ticks

`time.seconds` is always available. Depending on the render request, `time.beats`, `time.ticks`,
and `time.frame` may also be present. Declare `timing.conversion` when you need reliable conversion
through the project's tempo map:

```ts
const beat = context.timing?.secondsToBeats(time.seconds);
if (beat?.ok) {
    const pulse = beat.value % 1;
    // pulse moves from 0 to almost 1 once per beat.
}
```

The timing facet converts between seconds, beats, and ticks and exposes the time signature. This is
useful for beat-synced rotation, bar grids, countdowns, and visuals that remain musical across tempo
changes.

## Sample animated properties

`props` contains property values at the current render time. The property API can inspect the same
property at another time or summarize a numeric property over a range:

```ts
const earlier = context.properties.valueAt('size', time.seconds - 0.25);
const average = context.properties.average('size', {
    startSeconds: Math.max(0, time.seconds - 1),
    endSeconds: time.seconds,
});
```

`valueAt()` can create trails or comparisons. `average()` can smooth an animated control, while
`integrate()` can turn an animated speed property into distance travelled. These reads respect the
user's effective property values without exposing MVMNT's automation internals.

## Shape values into motion

The root package exports small animation helpers:

```ts
import { clamp, easings, lerp, remap } from '@mvmnt-app/plugin-sdk';

const loudness = clamp(level, 0, 1);
const radius = remap(0, 1, 20, 120, loudness);
const easedX = lerp(-100, 100, easings.easeInOutCubic(progress));
```

These are useful for mapping MIDI velocity or audio values into sizes, colours, opacity, and
positions. `FloatCurve` handles a reusable multi-point response curve when one easing function is
not enough.

## Compose render objects safely

Render objects can contain children and share transforms. `ClipLayer` keeps drawing inside a fixed
area, `GlowLayer` adds a glow pass, and `CompositeLayer` groups content under a blend mode.

Keep layout independent from animated drawing. Return one invisible `Rectangle` with
`layoutParticipation: 'include'` and set every visible object or layer to `exclude`, as shown in the
[quickstart layout pattern](quickstart.md#keep-layout-bounds-stable). This gives the host stable
selection handles, anchors, and hit testing even when the drawing changes completely.

For large event windows, cap the number of objects you produce or use `limitRenderObjects()`. Dense
pixel data is usually better represented with `PixelGrid` or a generated raster than thousands of
small rectangles.

## Where to go next

- [Authoring](authoring.md) covers richer schemas, lifecycle callbacks, and capability behavior.
- [Rendering and assets](rendering-and-assets.md) covers hierarchies, images, atlases, and generated
  rasters.
- [Audio](audio.md) goes deeper on analyzed features, raw PCM, and calculators.
- [Instance resources](instance-state.md) shows how to reuse handles and render objects safely.
- [Deterministic simulation](simulation.md) is for springs, particles, and other previous-step state.
- [API reference](reference.md) lists the exact package boundaries and manifest contract.

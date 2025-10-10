# Audio Visualisation Phase 0 Foundations

_Last reviewed: 2025-03-08_

## Single-feature property inventory

### Audio Spectrum (`audioSpectrum`)
- **Property:** `featureDescriptor` (required `spectrogram`)
- **Single-feature assumption:** Inspector enforces a single spectrogram descriptor.
  The binding stays tied to one audio track, channel selection is per-channel or auto mix, and
  runtime sampling reads one descriptor each frame.
- **Migration approach:** Replace `featureDescriptor` with `features[]`.
  Accept ordered descriptors so shared cache reads can be reused.
  Add deduplication so shared descriptors reuse cache reads and backfill the first entry for legacy
  scenes.
- **Owner:** Scene Runtime Guild

### Audio Volume Meter (`audioVolumeMeter`)
- **Property:** `featureDescriptor` (required `rms`)
- **Single-feature assumption:** Meter hydrates one RMS descriptor.
  It clamps smoothing per descriptor so edits stay scoped.
  Runtime sampling reads a single RMS value for bar height while macro binding blocks edits.
- **Migration approach:** Introduce `{ features: [{ featureKey: 'rms', channelAlias? }] }`.
  Provide aggregation helpers
  to combine multiple channels before draw and wrap the previous descriptor as the first entry.
- **Owner:** Scene Runtime Guild

### Audio Oscilloscope (`audioOscilloscope`)
- **Property:** `featureDescriptor` (required `waveform`)
- **Single-feature assumption:** Oscilloscope caches one waveform descriptor and reuses it for range
  sampling. The inspector offers only a single feature choice per element.
- **Migration approach:** Extend the window sampler to accept descriptor arrays.
  Provide per-channel offsets, share window metrics, and map the legacy descriptor to index `0`.
- **Owner:** Scene Runtime Guild

### Inspector audio binding block
- **Property:** `audioFeatureDescriptor` input paired with `timelineTrackRef`
- **Single-feature assumption:** Property panel renders track and descriptor as one binding block.
  It clears descriptors when the track is removed and only offers auto mix plus numeric indexes.
- **Migration approach:** Iterate over descriptor lists and surface alias chips per descriptor.
  Collapse to a single row when only one descriptor exists.
- **Owner:** Inspector UX Team

### Scene store migration
- **Property:** `migrateLegacyAudioFeatureBinding`
- **Single-feature assumption:** Legacy bindings promote one descriptor into `featureDescriptor`.
  Calculator extras are dropped.
- **Migration approach:** Wrap the promoted descriptor in a single-entry array.
  Populate future `analysisProfileId` and alias metadata fields at the same time.
- **Owner:** Persistence & Import Crew

## UX reference flows

### Cache regeneration prompts

1. When an element requests a descriptor missing from the cache, show a prompt beside the inspector
   binding block.
2. The prompt summarizes the analysis profile, feature keys, and channel aliases and offers
   `Regenerate` and `Later` actions.
3. Choosing `Regenerate` queues the analysis job.
   The prompt switches to `Queued`, `Running`, and `Ready` states.
4. Selecting `Later` collapses the prompt into a diagnostics banner for follow-up.
5. Design review: Approved by Design Systems on 2025-03-07 for copy tone and interaction states.

### Diagnostics panel flow

1. Opening the diagnostics drawer groups entries by audio track and lists descriptors with their
   analysis profile.
2. Stale entries display cache-versus-request diffs with a scoped `Regenerate` button.
3. Completed entries show the last regenerated timestamp and a `View history` link for provenance.
4. Hovering a descriptor highlights bound elements in the scene outline for dependency tracing.
5. Design review: Approved by Design Systems on 2025-03-07 with tracker annotations.


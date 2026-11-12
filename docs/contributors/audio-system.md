# Audio system

## Ownership model

Timeline tracks and clips own placement, gain, mute state, and immutable source IDs. `audioCache`
entries own decoded `AudioBuffer` data, waveform metadata, and references to original imported
bytes. Feature caches are keyed by source and canonical artifact identity (feature, calculator, and
analysis profile) so clips can reuse analysis without duplicating work.

Original bytes and decoded PCM are separate resources. Small originals may remain inline; large
ones use `AudioAssetStore` in IndexedDB. A process-local memory fallback keeps the current session
usable when IndexedDB fails, but cross-session durability comes from saving the project.

## Residency and persistence

If decoded PCM is absent, rehydration reads inline bytes or the stored asset ID and decodes them.
Missing bytes mark the source failed rather than crashing the editor. Import and export validate
asset lengths and hashes.

Export collects only referenced sources, preferring original bytes and falling back to generated
float32 WAV data. Content hashes deduplicate package assets. Waveforms and optional feature caches
are packaged separately. Cache payload v5 records canonical artifact IDs and byte lengths. Scene
files also retain an element-level demand snapshot so a missing plugin or omitted cache can still
explain what analysis is required.

## Feature analysis

Registered calculators transform decoded PCM into feature tracks such as spectrogram, RMS,
waveform, peaks, and pitch guidance. A track records its calculator/version, frame layout, hop
duration, analysis profile, format, and channel metadata.

Each SDK element definition exposes `audioFeatureDemands(props)`. The runtime atomically replaces
that instance's requests when its props or macros change and removes them on disposal. The retained
intent registry is the source of truth for diagnostics and persistence; imported snapshots are
fallbacks only until an available plugin publishes its authoritative declaration. Sampling never
creates a request. The scheduler runs requested calculators, reports progress, supports
cancellation, and merges completed tracks into caches. Declarative SDK demands enqueue missing or stale
analysis automatically; legacy diagnostic intents remain user-managed.

Feature cache status is `idle`, `pending`, `ready`, `failed`, or `stale`. Calculator-version,
profile, source, or tempo-projection changes can invalidate cached tracks. The diagnostics store
derives user-facing status and reanalysis actions from retained demands, validated cache artifacts,
and runtime jobs. Failed analysis remains an explicit user action so a bad source cannot create a retry loop.

## Sampling

Descriptors identify analyzed data; interpolation and smoothing are runtime sampling options and do
not change cache identity. Sampling resolves the enabled clip under the requested timeline time,
maps it into source time, and returns silence in gaps. Feature and raw PCM reads are pre-fader.

Internal elements may use the scene audio utilities directly. External plugins use only the scoped
SDK audio facet described in the [plugin audio guide](../plugin-api/audio.md).

## Maintenance rules

- Increment a calculator version when its algorithm or output contract changes.
- Keep feature keys namespaced when they are not built-in standards.
- Report progress and honor the provided abort signal in long calculations.
- Do not expose cache instances, mutable typed arrays, or timeline store objects through plugin APIs.
- Cover analysis, serialization, tempo alignment, cancellation, and source residency changes with
  focused tests under `src/audio/` and `src/state/`.

## Project opening and background preparation

Editor file opening restores original audio references, saved waveform peaks, and feature caches
before decoding PCM. Deferred sources use the runtime-only `deferred` state; the preview and timeline
show preparation status without blocking editing. Import callers that require complete audio keep
waiting by default. Background export imports also retain that behavior.

A shared decode queue runs one decoder at a time and coalesces requests for the same original.
Playback and export requests take priority over queued background preparation. Results are accepted
only while both the document generation and source identity still match. Native decoding cannot be
interrupted once started; obsolete results are discarded.

Package extraction runs in an import worker. Built-in feature calculations and missing waveform
extraction share a serial worker queue. PCM is copied in bounded chunks so live playback buffers
are never transferred or detached. Custom calculators retain the existing cooperative execution
path. Automatic analysis waits until import has restored its caches and original assets, and saved
waveforms are reused rather than scanned again. Export waits for decoded sources and analysis.

Desktop opening reuses incoming package bytes for recovery when the persisted document is unchanged.
Migrations, font reconciliation, and filename changes require a fresh recovery package. Large byte
copies yield between chunks; hashes of contiguous buffers do not allocate intermediate merged copies.
These changes reduce temporary allocations and renderer work. Fully decoded PCM remains resident;
this is not streaming playback or automatic PCM eviction.

### Measuring opening performance

The developer overlay's **Memory and Import Diagnostics** section includes project-opening timings,
individual audio jobs, first preview time, long-task totals, longest frame gap, queue counts, and
estimated audio memory. Observation continues for 30 seconds after import returns. The final snapshot
is also emitted as the local `mvmnt-project-load-diagnostics` window event. No diagnostic data is sent
to a service. Frame gaps can include background-tab throttling; memory estimates do not include every
native decoder or GPU allocation.

For comparisons, use the same production Electron build settings and machine. Test opening from the
home screen and File → Open, both after launch and on repeated opens. Include projects with saved
analysis, missing or stale analysis, multiple sources, and long stereo audio. Record the opening
interval and 30 seconds afterward, then compare renderer long tasks, input responsiveness, first
preview, and peak memory. Check playback and export after preparation as well.

An isolated development-browser check of `Fish.mvt` measured a 181 ms maximum timer gap during
synchronous extraction and 6 ms with worker extraction (181 ms and 188 ms total respectively).
This demonstrates moving extraction off the renderer; it is not a full-project Electron performance
guarantee. Built-in worker feature output was also compared exactly against local calculations.

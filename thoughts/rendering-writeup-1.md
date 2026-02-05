# Rendering pipeline walkthrough (RenderModal ➜ encoded output)

## High-level flow

-   **UI entry point:** `RenderModal` (`src/workspace/layout/RenderModal.tsx`) gathers export preferences and kicks off either a PNG sequence export or an MP4 video render.
-   **Context orchestration:** The modal calls `exportSequence` / `exportVideo` exposed by `VisualizerContext`. That context is responsible for showing progress UI, deriving timeline ranges, and delegating to the appropriate exporter instance.
-   **Exporter instances:** `useVisualizerBootstrap` lazily loads heavy modules and instantiates `ImageSequenceGenerator`, `VideoExporter`, and (indirectly) `AVExporter`, all sharing a single `MIDIVisualizerCore` instance bound to the workspace canvas.
-   **Frame production:** Both exporters drive the visualizer deterministically with an `ExportClock`, rendering frames via `MIDIVisualizerCore.renderAtTime`, which in turn delegates to `ModularRenderer` and the scene graph runtime.
-   **Encoding / packaging:**
    -   PNG exports stream frames to blobs and zip them with JSZip before triggering a download.
    -   MP4 exports encode frames with Mediabunny’s WebCodecs wrapper and, when possible, ask `AVExporter` to mux in an offline audio mix.

## Detailed path

### 1. `RenderModal`: collecting intent and dispatching a job

-   Tracks a mix of legacy (`qualityPreset`, `bitrate`) and newer (`videoCodec`, `videoBitrateMode`, advanced audio controls) fields in local state.
-   On **Start**, it:
    1. Persists the chosen parameters back into the global `exportSettings` via `setExportSettings`, so future runs share new defaults.
    2. Calls either `exportSequence` or `exportVideo` from `VisualizerContext` with an override payload that mirrors the local state (including the legacy bitrate fields for backward compatibility).
-   It also preloads codec capability data (`mediabunny` helpers) and lazily registers the MP3 encoder when the user picks that codec.

### 2. `VisualizerContext`: bridging UI and exporters

-   Houses shared state (`exportSettings`, `showProgressOverlay`, `progressData`) and exposes the `exportSequence` / `exportVideo` callbacks.
-   `useVisualizerBootstrap` ensures that the heavy modules load only once; it resolves four dynamic imports in parallel:
    -   `@core/visualizer-core.js` → `MIDIVisualizerCore`
    -   `@export/image-sequence-generator.js` → `ImageSequenceGenerator`
    -   `@export/video-exporter.js` → `VideoExporter`
    -   `@export/av-exporter.js` → executed for its side effect of registering `window.AVExporter`
-   Export callbacks share the same template:
    -   Merge overrides into the current `exportSettings`.
    -   Validate partial ranges when the user disables `fullDuration`.
    -   Show the progress overlay (`setShowProgressOverlay(true)`, `exportKind` set to `png` or `video`).
    -   Derive additional metadata:
        -   Partial exports convert seconds to frame indices.
        -   Audio-enabled video exports derive tick ranges from the timeline store (preferring `playbackRange`, falling back to the entire scene duration), so `AVExporter` can request the correct slice.
    -   Delegate to the instantiated exporter; progress callbacks update the overlay, and failures bubble up via `alert`.

### 3. `ImageSequenceGenerator`: deterministic PNG sequence

-   Resizes the shared canvas to the requested resolution, tells the visualizer to resize, and creates an `ExportClock` (with an optional timing snapshot for tempo determinism).
-   Iterates over `totalFrames` (clamped by a range if supplied), calling `visualizer.renderAtTime(time)` for each frame.
-   Converts the canvas to PNG blobs, recording `{blob, frameNumber, filename}` entries.
-   Defers JSZip loading until needed by adding a `<script>` tag pointing at the CDN. Once loaded, it zips the frames plus a metadata JSON file and triggers a download with a sanitized filename.
-   Restores the canvas size and visualizer after completion or error.

### 4. `VideoExporter`: MP4 via Mediabunny

-   Shares the same resize/restore pattern and uses `ExportClock` to advance through frames.
-   Resolves audio tick ranges when `includeAudio` is true:
    -   Uses the timeline store + shared `TimingManager` to map playback range seconds to ticks.
    -   Falls back to scene duration if the user hasn’t set an explicit playback span.
-   **Audio delegation:** If ticks are available and `window.AVExporter` is present, it constructs a new `AVExporter` and hands the job off. Successful delegation returns a combined blob (or separate video/audio blobs) and short-circuits the rest of the method.
-   **Video-only path:**
    -   Configures Mediabunny’s `Output`, `BufferTarget`, and `CanvasSource`. Codec selection prefers `avc` (alias `h264` in the UI) and falls back to the first supported codec from `getEncodableVideoCodecs`.
    -   Bitrate resolution honours (in order) manual `videoBitrate`, legacy `bitrate`, then a heuristic (`width * height * fps * 0.09`, clamped to 0.5–80 Mbps).
    -   For each frame, `visualizer.renderAtTime` is invoked and the canvas image is handed to the encoder with a zero-based timestamp derived from the playback range start (`computeEncodeTimestamp`).
    -   After finalization, a Blob is produced and downloaded immediately unless `suppressDownload` is requested.

### 5. `AVExporter`: combined audio + video

-   Also resizes the canvas and reuses `ExportClock`, but its biggest pre-flight step is the **offline audio mix**.
    -   Calls `offlineMix` with the timeline store’s audio tracks, order, and cache, mixing between `startTick` and `endTick` into an `AudioBuffer` at the requested sample rate (currently hard-wired to 48 kHz when invoked from `VideoExporter`).
    -   Produces a WAV blob (for fallback download) and reports peak / duration metrics.
-   Configures Mediabunny output similarly to `VideoExporter`, but additionally sets up an `AudioBufferSource` track, choosing the audio codec via capability checks and lazily registering the MP3 encoder if requested.
-   Iterates frames with timestamps derived from ticks (ensuring determinism when tempo maps change mid-export) and feeds both canvas frames and the mixed audio buffer into the encoder.
-   Returns:
    -   `combinedBlob` (video+audio MP4) when muxing succeeds,
    -   `videoBlob` and optional WAV blob when muxing fails,
    -   reproducibility metadata (hash, mix peak, duration) for downstream diagnostics.

### 6. Frame rendering internals (`MIDIVisualizerCore`)

-   Holds the scene graph runtime, timeline integrations, and rendering loop.
-   `renderAtTime` asks the runtime adapter to build render objects for the target time and hands them to `ModularRenderer`, which draws onto the 2D canvas.
-   Maintains play ranges and synchronizes export-related dimensions back to the scene store so future renders match the exported resolution.
-   Export paths rely on the synchronous `renderAtTime` method; there’s no worker offload, so long exports monopolize the main thread.

### 7. Progress feedback and consumer UI

-   `VisualizerContext` exposes `showProgressOverlay`, `progressData`, and `exportKind`.
-   `MidiVisualizerInner` (workspace layout) listens to these flags and mounts `ExportProgressOverlay`, showing a progress bar and messaging while exports run. The exporters themselves trigger browser downloads; the overlay doesn’t currently show a post-export link because combined blobs aren’t surfaced back through the context.

## Points of confusion / structural rough edges

1. **Duplicated bitrate controls.** The modal still exposes legacy `bitrate` + `qualityPreset` alongside the new `videoBitrate` / `videoBitrateMode`, and the latter is what actually affects the Mediabunny call. The fallbacks keep behaviour working, but the UI logic is harder to reason about.
2. **`medium` preset silently maps to `high`.** `VideoExporter` only defines `low` and `high` in `presetMap`. Choosing "Medium" in the UI ends up using the high bitrate fallback, which is unintuitive.
3. **Audio channel / sample-rate settings bypass the mix.** `AVExporter` always calls `offlineMix` with `channels: 2` and a hard-coded 48 kHz sample rate. The modal’s `audioChannels` and `audioSampleRate` controls only influence the encoder configuration, not the actual mix, so selecting mono or 44.1 kHz doesn’t deliver the expected output.
4. **Global side-effect dependency.** `VideoExporter` requires `window.AVExporter`; if the dynamic import fails or runs after an export starts, audio gets dropped with only a console warning. Encapsulating the dependency would make failure states clearer.
5. **Canvas resizing impacts shared state.** Both exporters resize the single shared canvas and then restore it. If an export is interrupted or errors before the `finally` block runs, the workspace stays in the wrong resolution until the next render tick.
6. **Main-thread rendering bottleneck.** All frame rendering and encoding happens on the UI thread. Large exports visibly freeze the app; there’s no backpressure or worker delegation.
7. **JSZip CDN dependency.** PNG exports inject a remote `<script>` on demand. Offline or CSP-restricted environments will fail the export, and errors surface as generic promise rejections.
8. **Progress overlay never surfaces download links.** The overlay component allows for a `downloadUrl`, but the current pipeline relies on automatic downloads from inside the exporters. Users missing the default download prompt have no retry affordance.
9. **Export settings hydration inconsistencies.** `RenderModal` initialises `qualityPreset`, `bitrate`, and the `videoBitrate` slider from hard-coded defaults rather than current `exportSettings`, so reopened modals can show stale defaults even after a successful export.

## Follow-up ideas

-   Simplify the modal state by removing legacy bitrate controls or deriving them strictly from `exportSettings`.
-   Expand `presetMap` to honour the "Medium" option and document heuristic targets.
-   Thread `audioChannels` and `audioSampleRate` through `offlineMix`, or hide those knobs until the mix path supports them.
-   Replace the global `window.AVExporter` dependency with an injected reference when the module loads, so exporters fail fast if the bundle is missing.
-   Cache JSZip locally (or bundle it) and bubble meaningful errors to the user when loading fails.
-   Feed post-export blobs back through the context so the progress overlay can present explicit download actions and metadata.

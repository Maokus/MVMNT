# Audio Analysis Worker Research

Status: Open Questions

## Current pipeline observations

- Analysis jobs are queued on the main thread through `AudioFeatureAnalysisScheduler`, which invokes
  `analyzeAudioBufferFeatures` serially and resolves progress callbacks directly into the timeline
  store. (src/audio/features/audioFeatureScheduler.ts; src/state/timelineStore.ts)
- Each calculator mixes the input `AudioBuffer` down to mono independently, so the spectrogram, RMS,
  and waveform passes traverse the same channel data three times before beginning their own loops.
  (src/audio/features/audioFeatureAnalysis.ts)
- The spectrogram calculator implements a naïve discrete Fourier transform in nested loops over
  frames, bins, and window samples, leading to `O(N^2)` work per frame and frequent voluntary yields.
  (src/audio/features/audioFeatureAnalysis.ts)
- Cooperative yielding relies on `requestAnimationFrame` when available; background tabs throttle or
  pause these callbacks, so long analyses progress noticeably slower when the page loses focus.
  (src/audio/features/audioFeatureAnalysis.ts)

## Dedicated worker feasibility

- The analysis pipeline depends on plain data structures (typed arrays, tempo mapper utilities, and
  progress callbacks). No DOM-specific APIs are required, but `AudioBuffer` would need to cross the
  thread boundary. While recent browsers allow transferring `AudioBuffer`, a fallback plan should be
  ready to serialize channel data into transferable `Float32Array` payloads to avoid structured clone
  failures in older engines.
- Progress updates currently close over `set` from the timeline store. Moving analysis off-thread will
  require a message protocol that forwards progress and completion events back to the store while
  respecting the existing cancellation semantics. Abort signals map cleanly onto worker ports by
  posting cancellation messages and terminating outstanding jobs.
- The queue currently enforces single-job execution. A worker can host the same queue logic to retain
  deterministic ordering, or spawn multiple workers if parallelism becomes desirable. The main thread
  scheduler would shrink to message dispatch plus lifecycle bookkeeping.
- Yield intervals should switch to `setTimeout` (or `Atomics.wait` in shared memory scenarios) inside
  the worker because `requestAnimationFrame` is unavailable. The existing helper already falls back to
  `setTimeout`, so the behaviour is consistent once the code executes in a worker context.
- Bundling considerations: Vite supports module workers out of the box, but imports that rely on
  browser globals must be audited. Timing helpers and tempo mappers only use ECMAScript features, so
  they can ship inside a worker bundle without shims.

## GPU acceleration considerations

- The current spectrogram loops compute sine and cosine per bin/sample pair. Adopting an FFT-based
  implementation (e.g., KissFFT via WebAssembly or an existing FFT library) would reduce complexity
  to `O(N log N)` before any GPU work and is a prerequisite for meaningful GPU gains.
- Libraries such as `gpu.js`, WebGPU compute shaders, or WebGL transform feedback could accelerate
  the FFT once the algorithm is vectorised. Integration would require packaging shader assets for
  Vite and providing a CPU fallback path for browsers without GPU compute.
- GPU upload costs are significant for full-length audio buffers. Chunking the analysis (windowing a
  few seconds at a time) keeps GPU memory requirements manageable and aligns with transferable blocks
  if the worker also adopts segmented processing.

## Additional optimisation ideas

- Share a cached mono mix across calculators so downstream passes reuse the same buffer instead of
  re-running `mixBufferToMono` three times per job.
- Vectorise inner loops using typed-array helpers (e.g., `Float32Array` dot products) or WebAssembly
  SIMD to reduce JavaScript overhead without waiting for GPU adoption.
- Allow partial re-analysis by calculator ID so quick iterations (e.g., only RMS) skip spectrogram
  work entirely; the scheduler already accepts a calculator filter but the UI could expose it.
- Persist intermediate FFT windows when computing both spectrogram magnitude and derived metrics
  (such as spectral centroid) to avoid recomputing Fourier transforms for future feature types.
- Investigate moving cache ingestion to a transferable payload so large feature arrays avoid cloning
  when returned from the worker back to the main thread.


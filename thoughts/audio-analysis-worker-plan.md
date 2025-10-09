# Audio Analysis Worker Migration Plan

Status: Draft Plan

## Goals

- Offload the existing `AudioFeatureAnalysisScheduler` work to a dedicated Web Worker without breaking the sequencing guarantees of the current queue.
- Preserve responsive UI progress updates so the timeline store continues to reflect calculator-level progress and completion.
- Allow the main thread to start, pause, resume, or cancel analyses on demand while maintaining full control over worker lifecycle.

## Phase 1: Worker foundation

1. **Extract transferable payload helpers**
   - Add a serializer that converts an `AudioBuffer` into a `{ sampleRate, channels: Float32Array[] }` payload when structured cloning is unavailable. Cache the mixed mono buffer so repeated calculators reuse it.
   - Document the inverse deserializer so the worker receives data in the same format. Add unit tests for both directions.
2. **Create a module worker bundle**
   - Add `scripts/audioAnalysisWorker.ts` (or live under `src/workers/`) that imports the analysis calculators and exposes a message handler. Ensure dependencies avoid DOM-only APIs.
   - Configure Vite to treat the new entry as a module worker and update the scheduler import site to lazily instantiate the worker.
3. **Define a message protocol**
   - Draft TypeScript types for `AnalysisRequest`, `ProgressUpdate`, `Complete`, `Error`, and `CancelAck` messages in a shared module (`src/audio/features/workerMessages.ts`).
   - Include calculator metadata (IDs, total steps) so the main thread can reconcile updates with existing progress bars.

## Phase 2: Scheduler refactor

1. **Worker lifecycle management**
   - Replace the direct invocation inside `AudioFeatureAnalysisScheduler` with postMessage requests. Maintain a single in-flight job to preserve ordering.
   - Track the worker instance in the scheduler; expose `ensureWorker()` and `disposeWorker()` helpers to restart on failure or shutdown when idle.
2. **Progress forwarding**
   - Translate worker `ProgressUpdate` messages into the existing timeline store callbacks. Ensure updates remain throttled to avoid React state floods.
   - Emit synthetic `start` events when a job begins so UI loaders behave identically to the current implementation.
3. **Result resolution**
   - When the worker posts a `Complete` message, resolve the pending promise with feature arrays (transfer back via `postMessage` with transferable buffers to avoid cloning cost).
   - On `Error`, reject the promise and surface the message to the UI toast/logging pipeline.

## Phase 3: Cancellation and control flow

1. **Abort signal integration**
   - Extend the scheduler to listen for `AbortSignal` events and forward `Cancel` messages to the worker. Terminate the worker if it fails to acknowledge within a timeout.
2. **Queue control**
   - Preserve the queue semantics by pausing dispatch when a job is active and only dequeuing after `Complete`, `Error`, or `CancelAck` messages arrive.
   - Add tests covering rapid enqueue/dequeue scenarios to confirm ordering is stable.
3. **Manual pause/resume hooks**
   - Introduce optional methods for the UI to pause/resume the worker (post `Pause`/`Resume` messages). Initially stub these out while documenting required UI wiring.

## Phase 4: Progress UX enhancements

1. **Granular progress estimation**
   - Inside the worker, emit progress after each major loop (e.g., per window chunk) using the calculator's known total frame count. Normalize to percentage before sending.
   - Consider adaptive chunk sizing so long-running FFT batches still report at least once every 100ms.
2. **Main-thread reconciliation**
   - The timeline store should maintain the last known status per calculator. When a job completes, mark it as `done` and clear any stale progress intervals.
   - Persist progress snapshots in case the UI reloads mid-analysis (e.g., store in `sessionStorage` keyed by job ID).

## Phase 5: Robustness and rollout

1. **Fallback path**
   - Feature-detect worker support. If unavailable, fall back to the existing main-thread analysis and log a warning so the UI still functions on legacy browsers.
2. **Performance validation**
   - Benchmark the worker-based pipeline with the new FFT spectrogram implementation. Compare total analysis time and main-thread responsiveness against the baseline.
3. **Documentation**
   - Update `/docs/audio-analysis.md` (or create it if missing) with the worker architecture, message protocol, and testing instructions. Cross-link from this planning note once shipped.
4. **QA checklist**
   - Verify progress bars, cancellation, and error states in Chrome, Firefox, and Safari.
   - Confirm that background tab throttling no longer halts analysis thanks to worker timers.

## Open Questions

- Should we pool multiple workers for long tracks, or is a single worker sufficient after the FFT optimisation lands?
- Do we need SharedArrayBuffer support to implement precise pausing, or are cooperative checkpoints adequate?
- How should we version worker messages to support future incremental analysis features?


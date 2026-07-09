# Bulk Audio Import Stability and Crash Recovery Plan

**Date:** July 2026
**Status:** Proposed
**Related:** [audio-memory-reduction-2026-06.md](./audio-memory-reduction-2026-06.md), [docs/audio-features/audio-cache-system.md](../docs/audio-features/audio-cache-system.md)

## Problem

Users report that importing 17 WAV files of about 80 MB each makes the app slow and can crash the browser. This is plausible with the current implementation.

The import flow decodes each file immediately in `src/state/timeline/commands/addTrackCommand.ts`, then stores both the decoded `AudioBuffer` and the original file bytes in `audioCache`. For WAV, the "original" copy is not meaningfully compressed, and the decoded buffer is usually larger than the file because Web Audio stores PCM as 32-bit floats.

Approximate memory for one 80 MB, 16-bit stereo WAV:

- Original retained bytes: 80 MB
- Decoded float PCM: about 160 MB
- Temporary decode inputs/copies while importing: another 80-160 MB
- Baseline retained after import: about 240 MB before waveform, feature caches, undo, React/Zustand object overhead, and export/save spikes

For 17 files, baseline retained audio memory can exceed 4 GB. Spectrogram analysis is queued sequentially, but each completed cache can add hundreds of MB for long files because `src/audio/features/calculators/spectrogramCalculator.ts` stores a full `Float32Array` of `frameCount * binCount`. Manual saving also routes through `exportScene`, which builds a full `.mvt` zip in memory and can amplify memory pressure when the user is trying to protect work.

## Current Recovery Behavior

`LocalSaveService` can restore one manually saved `.mvt` package from IndexedDB on startup. This helps only if the user saved before the crash. There is no lightweight autosave journal, no per-import checkpoint, and no recovery prompt for unsaved edits.

The dirty tracker only records whether state differs from the last explicit local save. `beforeunload` warns on navigation, but a renderer/process crash does not run a reliable cleanup path.

## Goals

- Keep large multi-file imports below browser memory limits.
- Keep the UI responsive during long imports and analysis.
- Preserve as much work as possible if the app crashes mid-import or during later editing.
- Avoid using the full export pipeline for frequent autosaves.
- Preserve existing `.mvt` export/import compatibility.

## Non-Goals

- Replacing the entire audio engine in one pass.
- Guaranteeing recovery after IndexedDB quota eviction or private-browsing storage denial.
- Implementing true disk-backed streaming playback for every browser immediately.

## Plan

### Phase 1: Import Guardrails and Better Failure Behavior

Add a preflight step before bulk audio import in `useAudioImport` and drag/drop import:

- Sum selected audio byte sizes and estimate decoded PCM memory from file type where possible. For WAV, parse the RIFF header to estimate channels, sample rate, bit depth, and duration without decoding.
- Warn when projected retained memory crosses conservative thresholds, for example 1.5 GB warning and 2.5 GB hard confirmation.
- Show a batch import progress modal with current file, decoded count, skipped count, and cancellation.
- Catch per-file failures without aborting the whole batch.
- After every successful track insert, checkpoint the lightweight scene journal described in Phase 4.

This does not solve the memory model, but it prevents blind imports that are likely to kill the tab and gives the user a controlled escape path.

### Phase 2: Stop Retaining WAV Original Bytes on the JS Heap

Move `AudioCacheOriginalFile.bytes` out of Zustand for large audio. Introduce an `AudioAssetStore` in IndexedDB:

- Store original imported file bytes by content hash or generated asset ID.
- Keep only `assetId`, name, MIME type, byte length, hash, and availability status in `audioCache`.
- For export, read bytes from `AudioAssetStore` instead of `audioCache.originalFile.bytes`.
- Keep small files in memory only if below a low threshold, for example 8-16 MB.
- For imports where IndexedDB write fails, fall back to the existing in-memory path and show a warning that crash recovery/export reliability is reduced.

For the reported workflow this removes about 1.36 GB of retained heap for 17 * 80 MB WAVs.

### Phase 3: Bound Decoded Audio Memory

Decoded `AudioBuffer` is the largest unavoidable current cost. Add an audio-source residency manager:

- Track last-used time and pin state for each decoded source.
- Keep decoded buffers for enabled tracks near the playhead, selected tracks, and tracks actively used by render/export.
- Evict decoded buffers for muted, disabled, distant, or least-recently-used sources when the estimated decoded PCM budget is exceeded.
- Restore evicted buffers by re-decoding from `AudioAssetStore`.
- Represent cache entries as `ready`, `evicted`, `decoding`, or `failed` so UI can show recoverable state instead of crashing.

Start with conservative behavior: do not evict while playing or exporting. Evict only after imports, after analysis completes, and while idle. Even this can prevent immediate death after bulk import.

### Phase 4: Lightweight Autosave Journal for Crash Recovery

Add a separate crash-recovery store instead of calling `LocalSaveService.saveCurrentFile()` frequently.

Journal contents:

- Scene metadata, scene elements, macros, automation, timeline tracks/order/ranges, MIDI cache metadata, and references to audio/visual/font assets.
- Audio asset IDs and availability status, not raw audio bytes.
- Audio feature cache metadata/status only; large feature arrays are omitted and can be regenerated.
- Undo stack is not required for crash recovery.

Write policy:

- Debounce normal edits, for example 2-5 seconds after the last structural change.
- Flush immediately after successful bulk-import steps, track add/remove, and before starting memory-heavy export.
- Keep two slots: `current` and `previous-good`, so a torn write does not destroy the last recoverable snapshot.
- Store a monotonically increasing revision, timestamp, app version, and schema version.

Startup behavior:

- If a recovery journal exists and is newer than the last explicit local save, show a recovery prompt.
- Offer "Recover", "Open last saved", and "Discard recovery".
- On recovery, hydrate the scene, then lazily rehydrate audio buffers from `AudioAssetStore`. Missing assets should produce disabled/missing-audio tracks, not import failure.

This addresses the core data-loss issue: if the tab crashes after 12 of 17 files, the user should recover a scene with 12 imported tracks and clear status for the remaining missing work.

### Phase 5: Reduce Feature-Cache Memory and Make Analysis Demand-Driven

The previous memory plan already identifies full spectrogram storage as a major cost. For bulk imports, make analysis opt-in or bounded:

- Do not run all calculators immediately for every imported file. Generate only the lightweight timeline waveform/peaks needed for the track UI.
- Trigger RMS/spectrogram/pitch analysis when a scene element requests it or the user explicitly opens analysis tools.
- Add an import option: "Analyze now" versus "Analyze when needed"; default to lazy for large batches.
- Replace full linear spectrogram storage with either 128-256 mel bands or a windowed/on-demand cache.
- Evict feature tracks by calculator priority. Peaks and RMS are cheap to keep; spectrogram and pitch guide should be evictable/regenerable.
- Never include large feature arrays in crash-recovery autosaves.

For an 80 MB WAV of roughly 7.5 minutes, default 2048/512 analysis can produce about 39k frames. A 1025-bin float spectrogram is about 160 MB per file. Keeping that for 17 files is not viable.

### Phase 6: Make Undo Payloads Asset-Reference Based

`removeTracksCommand` currently captures `AudioCacheEntry` and `audioFeatureCache` objects in undo payloads. For large audio this can pin huge buffers even after a track is removed.

Change audio undo payloads to store:

- Track metadata and insertion index.
- Audio source ID and asset reference.
- Optional small waveform metadata.
- Feature cache keys/status, not the feature arrays themselves.

On undo, restore metadata immediately and rehydrate decoded/feature data from `AudioAssetStore` or by reanalysis. If data is not available, restore the track in a recoverable "missing audio" state.

### Phase 7: Lower Save/Export Peak Memory

Keep explicit `.mvt` export compatible, but reduce peak memory:

- Stream or chunk zip generation instead of building one `files: Record<string, Uint8Array>` containing every asset.
- Hash audio assets while writing them to `AudioAssetStore`, not every export.
- Exclude feature caches by default for very large projects, or provide "include analysis cache" as an advanced option.
- Ensure local manual save can reuse the recovery asset store and does not duplicate all audio bytes in both a `.mvt` zip and IndexedDB memory cache.

The current `LocalFileStore` also keeps a full in-memory copy of the saved zip. For huge projects, local save should prefer IndexedDB-only storage and avoid retaining the saved package in process memory.

## Implementation Order

1. Add instrumentation and estimates: memory estimator, import summary, and diagnostics logging around decode, retained audio bytes, decoded PCM, feature cache sizes, and export size.
2. Implement batch import preflight/progress/cancel UI.
3. Add `AudioAssetStore` and migrate export/import paths to support asset references while preserving old `originalFile.bytes`.
4. Add crash-recovery journal and startup recovery prompt.
5. Add decoded-buffer eviction and lazy rehydration.
6. Make feature analysis lazy/bounded for large projects.
7. Convert audio undo payloads to source references.
8. Stream/chunk export and revise local-save memory behavior.

## Acceptance Criteria

- Importing 17 * 80 MB WAV files does not crash on a typical desktop browser with a normal memory limit.
- The app shows progress and remains cancelable during bulk import.
- Retained JS heap after import is close to decoded working-set size, not decoded size plus all original WAV bytes plus full feature caches.
- A crash after any completed import step can recover all tracks imported before the last successful checkpoint.
- Recovery works even when large feature caches were not saved.
- Explicit `.mvt` export still embeds audio assets and can be opened on another device.
- Undoing removal of a large audio track does not retain a full decoded buffer and full spectrogram in the undo stack.

## Risks and Open Questions

- Browser storage quota varies. The app needs clear warnings when IndexedDB cannot store all audio assets.
- Web Audio decoding still requires full-file decode. True streaming decode/playback may require a larger engine change.
- If users import from ephemeral file handles and IndexedDB writes fail, recovery cannot restore audio bytes after a crash.
- Export streaming may need a replacement or wrapper around the current synchronous `fflate.zipSync` flow.
- Some elements may assume immediate feature availability. They need graceful pending/missing states while lazy analysis runs.

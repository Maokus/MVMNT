# Audio Memory Mitigation 2

This branch records the stable subset of the `audio_memory_mitigation` and
`hail_mary` work. The consolidation commit is:

- `6fe8938 Merge stable audio memory and clip improvements`

The branch keeps the memory and audio-clip improvements that passed verification, while
leaving out the less stable decoded-buffer eviction and autosave journal work.

## Included Work

### Audio Import And Memory Diagnostics

- Added audio memory diagnostics and a developer overlay section for retained audio,
  original-file storage, decoded PCM, waveform, and feature-cache estimates.
- Added import guardrails for large audio batches, including user-facing warnings,
  progress reporting, and abort support in file/template loading flows.
- Added `AudioAssetStore` so large original audio files can be stored in IndexedDB
  instead of retained directly in Zustand.
- Kept small original files inline for lower overhead.
- Added memory fallback behavior when IndexedDB storage is unavailable, with diagnostics
  warnings so export reliability is visible.

### Save, Export, And Import Stability

- Updated scene export/import to resolve audio bytes from inline originals,
  IndexedDB-backed assets, or decoded buffers when needed.
- Reduced peak export/local-save memory by avoiding unnecessary retained package copies
  and omitting oversized feature caches from export.
- Preserved compatibility with existing scenes that still contain inline audio bytes.
- Added tests for the audio asset store and large feature-cache export omission.

### Audio Analysis Behavior

- Deferred automatic feature analysis for large imported audio.
- Kept lightweight waveform generation for timeline display.
- Added tests covering deferred analysis behavior.

### Undo Payload Memory

- Removed decoded `AudioBuffer` objects from audio-track undo payloads.
- Restored undo/redo audio cache entries as metadata-only entries marked `failed` with
  an explanatory `decodedFailureReason`, instead of treating them as evicted buffers.

### Audio Clip Editing

- Added first-class audio clip helpers and commands.
- Rendered audio clips as real `AudioClipBlock` timeline blocks rather than track-level
  blocks.
- Added audio clip selection, multi-select toggling, horizontal drag, group drag, trim,
  rename, delete/copy/paste-style command integration, and cross-track drag to audio
  tracks.
- Updated clip timeline navigation and clipboard behavior to account for audio clips.
- Added tests for audio clips and audio clip commands.

## Not Ported

### Phase 3: Decoded Audio Buffer Eviction

This branch does not implement automatic decoded PCM eviction. Specifically, it does
not include:

- `evictDecodedAudioBuffers`
- decoded-buffer eviction diagnostics such as `decoded-buffer-evicted`
- idle eviction after import when decoded PCM exceeds a budget
- the `decodedState: 'evicted'` state
- playback/export pinning policy for eviction safety
- lazy rehydration flows that depend on an explicit evicted state

The branch can still store original audio bytes outside Zustand and can rehydrate
metadata-only sources where code paths request it, but it does not proactively remove
decoded buffers from active cache entries.

### Phase 4: Autosave Crash-Recovery Journal

This branch does not include the lightweight autosave journal. Specifically, it does
not include:

- `src/persistence/crash-recovery-journal.ts`
- journal tests or docs
- startup prompts for journal recovery
- periodic or structural-change journal checkpoints
- clearing a crash-recovery journal after local save
- per-import recovery checkpoints

Startup behavior remains the existing local-save/default-template flow.

## Verification

The consolidation commit was verified with:

```bash
npm install
npm run test
npm run build
npm run compile
```

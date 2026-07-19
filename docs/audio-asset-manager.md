# Audio Asset Manager

The audio asset manager is the persistence layer for original imported audio bytes. It
keeps large files out of Zustand while allowing audio tracks, save files, imports, and
runtime recovery paths to refer back to the original media when decoded PCM buffers are
missing.

This system is implemented by `src/persistence/audio-asset-store.ts` and referenced from
timeline import and scene import/export.

## State Model

Audio track metadata lives in the timeline store. Every audio track owns a `clips` array,
and each clip points at decoded/cache state with its required `sourceId`. A source may be
referenced by multiple clips or tracks.

Each source id indexes `audioCache`, whose entries contain:

- decoded runtime data: `audioBuffer`, duration, sample rate, channel count, and
  decoded-state metadata.
- optional `waveform` peaks for timeline display.
- optional `originalFile` metadata describing the source file and where its bytes live.

`originalFile` has the following storage forms:

- `inline`: small original bytes are stored directly as `Uint8Array` on the cache entry.
- `indexeddb`: large original bytes are stored in IndexedDB and referenced by `assetId`.
- `memory`: fallback storage when IndexedDB is unavailable or a write fails.
- `missing`: metadata exists, but the original bytes are not available.

The asset store only stores raw byte payloads by id. It does not own track metadata,
decoded `AudioBuffer`s, waveform peaks, or feature caches.

## Storage Backend

`AudioAssetStore` opens the `mvmnt-audio-assets` IndexedDB database and the
`audio-assets` object store. Values are stored by caller-provided ids created with
`createAudioAssetId(prefix)`.

`put(id, data)` clones the supplied bytes before storing them. It prefers IndexedDB and
deletes any stale memory fallback entry on success. If IndexedDB is unavailable or the
transaction fails, it stores a cloned `ArrayBuffer` in the module-local `memoryCache` and
returns `memory`.

`get(id)` also returns cloned bytes. It checks the memory cache first, then IndexedDB.
Missing ids, unavailable IndexedDB, and read failures resolve to `undefined` rather than
throwing. Callers are expected to mark the source as failed or emit a warning when the
asset is required.

Because the memory fallback is process-local, it is useful for the current session only.
Scenes that need to survive reload should save through the normal export/local-save
pipeline so bytes are packaged into the scene file.

## Importing Audio Files

Audio import reads the browser `File` into an `ArrayBuffer`, decodes it through
`AudioContext.decodeAudioData()`, and creates an `AudioCacheOriginalFile`:

- small files stay inline in the timeline store.
- files above the inline threshold are written through `AudioAssetStore.put()` using an
  `audio-original-*` id.
- IndexedDB-backed entries keep only `assetId`, byte length, MIME type, name, and storage
  metadata in Zustand.
- memory-fallback entries keep `assetId` and retain bytes on `originalFile.bytes` so the
  current session can still export or rehydrate.

Diagnostics are recorded when original bytes are stored outside Zustand or when storage
falls back to memory.

## Rehydration And Residency

Decoded `AudioBuffer`s are runtime resources. If an entry has no `audioBuffer`, timeline
rehydration tries to recover bytes from `originalFile.bytes` first and then
`AudioAssetStore.get(originalFile.assetId)`.

When bytes are found, the source enters `decoding`, is decoded back into an
`AudioBuffer`, and returns to `ready`. When no bytes are available, the source becomes
`failed` with `decodedFailureReason: 'original asset unavailable'`.

This supports metadata-only audio cache entries without introducing automatic decoded
PCM eviction.

## Scene Export

Scene export collects only audio sources referenced by audio tracks. For each source it
tries, in order:

- inline original bytes from `originalFile.bytes`.
- persisted original bytes from `AudioAssetStore.get(originalFile.assetId)`.
- a generated float32 WAV made from the decoded `audioBuffer`.

The collected bytes are hashed with SHA-256. The hash becomes the package-level audio
asset id, so duplicate sources are de-duplicated in the exported `.mvt` package.

Packaged exports write audio bytes as payload files and record metadata in
`assets.audio.byId`. Legacy inline JSON export can embed base64 data, but packaged
exports are the normal path. Waveform peaks are exported separately under
`assets.waveforms` when available.

## Scene Import

Scene import validates packaged or inline audio payloads, checks byte lengths and hashes,
decodes the bytes into `AudioBuffer`s, and ingests each source back into the timeline
cache.

Imported large originals are stored with `AudioAssetStore.put()` using an
`audio-import-*` id. Small originals remain inline. Existing ready audio feature caches
can suppress automatic re-analysis during ingestion.

The import path preserves the original source ids through `references.audioIdMap`, while
the package-level asset ids remain hash-based.

## Failure Handling

The asset store deliberately hides low-level IndexedDB failures from most callers:

- writes fall back to memory where possible.
- reads return `undefined` on failure.
- export/import code translates missing bytes into warnings or failed decoded
  state.

This keeps the editor usable even when browser storage is unavailable, while making
cross-session durability depend on successful local save or file export.

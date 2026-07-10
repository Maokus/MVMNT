# Autosave Journal

The autosave journal is the crash recovery path for unsaved editor changes. It writes a
lightweight snapshot of the current document into IndexedDB after timeline, scene, or
metadata mutations. On startup, the workspace offers to recover the journal when it is
newer than the last local save.

The implementation lives in `src/persistence/crash-recovery-journal.ts`. It complements
`LocalSaveService`; it is not the same thing as the saved `.mvt` package stored by local
save.

## Storage

The journal uses the `mvmnt-crash-recovery` IndexedDB database and the `journal` object
store. Two keys are written:

- `current`: the latest checkpoint.
- `previous-good`: the previous in-memory snapshot, written when a newer checkpoint
  succeeds.

Snapshots are JSON strings with `schemaVersion: 1`. Invalid JSON, unknown schema
versions, or records without document/audio data are ignored.

The module also keeps the latest snapshots in memory so recovery can still work during
the current session if IndexedDB is unavailable.

## Snapshot Contents

A journal snapshot contains:

- `revision`: a monotonically increasing in-session checkpoint number.
- `timestamp`: wall-clock time used to compare against local save time.
- `reason`: the reason supplied by the checkpoint caller.
- `document`: a `PersistentDocumentV1` built by `DocumentGateway.build()`.
- `audioSources`: one lightweight record per `audioCache` entry.

The document intentionally omits large `audioFeatureCaches`. It keeps
`audioFeatureCacheStatus` so the UI can still show cache state without making every
journal checkpoint write large analysis payloads.

Audio source snapshots preserve duration, sample rate, channel count, duration samples,
original-file metadata, and minimal waveform metadata. Decoded `AudioBuffer`s and full
waveform peak arrays are not journaled.

## Audio In The Journal

Original audio bytes are handled through the audio asset store:

- if `originalFile.assetId` already exists, the journal stores the reference.
- if original bytes are inline, the journal writes them to `AudioAssetStore` with an
  `audio-journal-*` id and stores that reference.
- if the audio source has no original bytes, the snapshot marks the original file as
  `missing`.

For memory-fallback audio assets, the journal keeps bytes on `originalFile.bytes` so the
current session can recover even when IndexedDB writes are unavailable.

Waveform snapshots keep only `version`, `sampleStep`, and a peak count. Recovery restores
an empty `Float32Array` for waveform peaks, so waveform display can degrade without
blocking scene recovery.

## Checkpoint Scheduling

`startCrashRecoveryJournaling()` subscribes to the timeline, scene, and metadata stores.
It schedules a debounced checkpoint when any of these change:

- timeline tracks, track order, MIDI cache, audio cache, playback range, or audio feature
  cache status.
- scene `runtimeMeta.lastMutatedAt`.
- scene metadata `modifiedAt`.

Scheduled checkpoints use a 3000 ms debounce window. Direct callers can force an
immediate write with `checkpointCrashRecoveryJournal(reason)`.

Checkpoint failures are non-fatal. They are recorded as audio memory diagnostics with
stage `recovery-journal-write-failed`.

## Startup Recovery

Workspace startup calls `loadCrashRecoveryJournal()` before falling back to local save or
the default template. If a journal exists and its timestamp is newer than
`LocalSaveService.savedAt()`, the user is prompted to recover it.

Choosing recovery calls `recoverFromCrashRecoveryJournal(snapshot)`:

- `DocumentGateway.apply(snapshot.document)` restores the persisted document state.
- audio cache entries are rebuilt from `audioSources`.
- rebuilt audio entries do not contain decoded buffers.
- sources with readable original bytes are marked `decodedState: 'evicted'`.
- sources without readable originals are marked `decodedState: 'failed'` with
  `original asset unavailable`.

After recovery, normal audio rehydration can decode sources on demand from inline bytes
or `AudioAssetStore` references.

Choosing not to recover clears the journal and continues with local save or the default
template.

## Clearing The Journal

The journal is cleared after a successful local save. `LocalSaveService.saveCurrentFile()`
exports the current state through the normal scene export pipeline, writes the packaged
bytes to `LocalFileStore`, and then calls `clearCrashRecoveryJournal()`.

Clearing removes both `current` and `previous-good` from IndexedDB, resets in-memory
snapshots, and cancels any pending debounce timer.

## Design Constraints

The journal is optimized for crash recovery rather than complete archival:

- it stores the current document shape, not undo history.
- it omits transient UI selections.
- it avoids large analysis caches and decoded PCM buffers.
- it depends on original audio bytes being inline, in `AudioAssetStore`, or still present
  in memory fallback.

For durable transfer between machines, use the normal `.mvt` export path.

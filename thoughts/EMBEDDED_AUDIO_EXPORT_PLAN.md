## Embedded audio in scene exports – plan (v2)

This revision incorporates gaps found in the earlier draft and folds in the decisions from the open questions (preserve original bytes when available, maintain clip-level edits in timeline data, derive asset ids from content hashes).

---

## Notable issues discovered in the first draft

1. **Audio id rewriting risks dangling references.** Clips are not the only place that may reference an audio id (automation lanes, selections, future metadata). A blanket replacement during export invites regressions unless every nested reference is audited.
2. **`durationTicks` derivation was underspecified.** Converting seconds to ticks during import relies on tempo state that may diverge from the exported document. We should persist enough timing information to avoid drift.
3. **Generated WAV fallback was lossy.** The helper defaults to 16-bit PCM, so decoding → WAV → reimport can degrade audio for float sources. The fallback has to preserve fidelity.
4. **Inline JSON mode had no guardrails.** Very large audio blobs could exceed browser limits or stall the UI. We need hard stops and progressive feedback.
5. **Waveform/peaks cache would be discarded.** Re-importing a large project would force the app to recompute peaks. We should persist them when available to avoid long blocking tasks.
6. **Schema lacked space for future non-audio assets.** Nesting only `assets.audio` now makes later expansion awkward.

---

## Goals (unchanged)

- Export a single artifact that restores the scene and all referenced audio clips without manual relinking.
- Ensure deterministic hashing for reproducible exports and deduplication.
- Remain backward compatible with schema v1.

## Non-goals (unchanged)

- No stems or bounced mixes in this milestone.
- No streaming or incremental decoding yet.

---

## Container formats

| Mode | Description | Pros | Cons | Guardrails |
| --- | --- | --- | --- | --- |
| **Inline JSON** | Entire envelope (schema v2) with base64 audio payloads. | Single file, trivial transport. | 33% bloat, higher memory, browser string limits. | Reject if total payload > 50 MB, show running progress, surface warning at 25 MB. |
| **Packaged ZIP (.mvmntpkg)** | ZIP with `document.json` + `assets/audio/<assetId>.<ext>` (raw source or fallback WAV). | Binary-safe, compressible, scalable. | Requires bundling fflate (or Compression Streams). | Stream entries where supported; chunk hashing to avoid large buffers. |

ZIP implementation: prefer `fflate` with streaming API. Feature-detect Compression Streams for browsers that can offload work off the main thread.

---

## Schema v2 outline

```ts
interface SceneExportEnvelopeV2 {
  schemaVersion: 2;
  format: 'mvmnt.scene';
  metadata: SceneMetadata;
  scene: SceneSnapshot; // unchanged
  timeline: TimelineSnapshot; // unchanged content, but see id strategy below
  assets: {
    storage: 'inline-json' | 'zip-package';
    createdWith: string;
    audio: {
      byId: Record<string, AudioAssetRecord>;
    };
    waveforms?: {
      byAudioId: Record<string, WaveformAssetRecord>;
    };
    // Additional asset namespaces slot in here later.
  };
  references?: {
    audioIdMap: Record<string, string>; // originalId -> assetId (debug/compat)
  };
  compatibility?: CompatibilityInfo;
}
```

```ts
interface AudioAssetRecord {
  kind: 'original' | 'wav';
  filename?: string;
  mimeType: string;
  byteLength: number;
  hash: string; // sha256 of raw bytes (content id)
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  durationSamples: number; // deterministic timing independent of tempo
  dataBase64?: string; // inline mode only
}

interface WaveformAssetRecord {
  version: 1;
  channelPeaks: Float32Array | number[]; // quantized 8-bit if we need smaller files later
  sampleStep: number; // how many samples per peak bucket
}
```

Notes:

- `assets.storage` pulls the top-level mode out of the nested `meta` block for clarity.
- `durationSamples` prevents tempo drift on import; UI can derive ticks from local tempo data.
- `byteLength` is always populated (even inline mode) to simplify progress reporting.
- `references.audioIdMap` lets us keep exported ids equal to their runtime values while still exposing the canonical hash mapping.

---

## Audio id strategy

- **Do not mutate ids inside the timeline snapshot.** Preserve whatever ids the document uses so automation, selections, or external tools remain intact.
- Store `assetId = sha256(bytes)` separately and expose an `audioIdMap`. During import we populate `audioCache[assetId]` and then register aliases so legacy ids resolve. When exporting again we rely on stored `originalFile.hash` to coalesce with existing assets.

---

## Export pipeline

1. **Collect audio usages**
   - Traverse timeline tracks, clip metadata, automation bindings, and any feature-specific registries to find every referenced audio id.
   - Include waveform cache keys to persist existing analysis data.

2. **Resolve source data**
   - Prefer `audioCache[audioId].originalFile.bytes` (Blob/Uint8Array) and mime type.
   - If absent, render WAV via a refactored helper that outputs 32-bit float PCM, matching the decoded buffer exactly.
   - Capture metadata: durationSeconds, durationSamples (from buffer length), sampleRate, channels.

3. **Hash + dedupe**
   - Stream bytes through `SubtleCrypto.digest('SHA-256')` using chunked readers to avoid large allocations.
   - Maintain `hash -> asset` map; reuse the first filename encountered.

4. **Assemble asset manifests**
   - Build `AudioAssetRecord`; attach base64 payload only in inline mode.
   - If waveform peaks exist, record them under `assets.waveforms.byAudioId[assetId]` with a version tag for future migrations.

5. **Package**
   - Inline mode: serialize envelope via deterministic JSON (sorted keys, stable spacing) to maintain reproducible diffs.
   - ZIP mode: write `document.json` and each asset file using `<assetId>/<filename>` if original name is safe, else `<assetId>.<ext>`.
   - Provide hooks for progress UI and size warnings before writing.

6. **Validation prior to return**
   - Ensure aggregate payload stays below configured thresholds; surface actionable warnings instead of silent truncation.

---

## Import pipeline

1. **Detect container** (zip vs JSON) and load `SceneExportEnvelopeV2` or v1 fallback.
2. **Validate envelope** using an extended validator:
   - Required fields present (`byteLength`, `durationSamples`, `hash`).
   - Hash verification (stream and compare) with error escalation if mismatch.
3. **Hydrate assets**
   - Decode audio bytes (respecting mime type). Retain original `Blob` so re-export can skip regeneration.
   - Populate `audioCache` entries keyed by `assetId`, then register `aliasMap[originalId] = assetId` for runtime compatibility.
   - Restore waveform caches when provided; otherwise schedule async analysis.
4. **Apply document** via existing gateway using untouched timeline ids.
5. **Post-import UX**
   - Display summary of imported assets, mismatches, or skipped files.
   - Kick off waveform jobs for missing caches.

Backward compatibility: v1 documents bypass the asset flow; mixed-version imports respect schemaVersion.

---

## Supporting utilities & plumbing

- Extract shared WAV encoding helpers that can emit 32-bit float PCM and accept channel-interleaved buffers.
- Add chunked hashing + base64 helpers; expose async iterables to limit main-thread blocking.
- Enhance `audioCache` entries with `{ originalFile?: { name, mimeType, bytes, hash } }` and optional `waveform` data.
- Introduce an alias resolver around `audioCache.get(id)` so existing callers continue to work with pre-hash ids.
- Provide a lightweight ZIP abstraction for packing/unpacking and share it with other export routines later.

---

## Edge cases & mitigations

- **Huge assets:** block inline mode when a single asset exceeds 10 MB (configurable) and suggest ZIP mode.
- **Unsupported decodes:** retain the raw bytes, mark asset as pending, and surface a relink workflow.
- **Hash collision (theoretical):** verify mime + byteLength; log telemetry if encountered.
- **Tempo mutations:** rely on `durationSamples` plus exported clip metadata to recompute tick lengths accurately.
- **Browser limits:** process assets sequentially with `await` to avoid simultaneous `ArrayBuffer` allocations.

---

## Testing & QA

- Unit tests for hash determinism, WAV fallback fidelity (float sine wave roundtrip equality), and asset dedupe.
- Integration tests covering v2 JSON + ZIP export/import loops, including waveform cache restoration and alias lookups.
- Regression test to ensure automation referencing legacy ids continues to function after v2 import.
- Tampering test: alter an asset in the ZIP, expect hash mismatch warning and skipped hydration.
- Large project stress test verifying progress reporting and memory usage.

---

## Milestones

1. **Infrastructure** – refactor WAV helper, add hashing/base64 utilities, augment audioCache structure.
2. **Writer (inline)** – implement manifest assembly, inline mode, and guardrails.
3. **Reader (inline)** – hydrate audio + waveform caches, alias resolver, validation.
4. **ZIP mode** – packaging/unpacking utilities, streaming hash verification.
5. **UI** – export dialog options, inline size warnings, progress indicator.
6. **Hardening** – waveform persistence, mismatch UX, telemetry, performance polish.


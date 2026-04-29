# Export Format Analysis — Current State & Improvement Opportunities (April 2026)

## Current Format: `mvmnt.scene` v6 ZIP Package

The current export is a ZIP file (`.mvt`) containing:

```
document.json          — main envelope (JSON)
Icon.icns              — app icon (cosmetic)
assets/audio/<id>/<filename>
assets/midi/<id>/track.mid
assets/fonts/<id>/<filename>
assets/waveforms/<id>/<filename>
assets/audio-features/<id>/<*.f32|.u8|.i16|.json>
assets/visual/<id>/<filename>
plugins/<pluginId>.mvmnt-plugin    (when embedPlugins=true)
```

### `document.json` top-level shape (v6)

```jsonc
{
  "schemaVersion": 6,
  "format": "mvmnt.scene",
  "metadata": { "id", "name", "createdAt", "modifiedAt", "author", "description" },
  "plugins": [{ "pluginId", "version", "hash", "elementTypesUsed", "embedded" }],
  "scene": {
    "elements": { "<id>": { "id", "type", "properties": { ... } } },
    "elementsOrder": ["<id>", ...],
    "sceneSettings": { ... },
    "macros": { ... },
    "automation": { ... }
  },
  "timeline": {
    "timeline": { ... },
    "tracks": { ... },
    "tracksOrder": [...],
    "midiCache": { "<cacheId>": { "assetId", "assetRef" } },
    "audioFeatureCaches": { ... },
    "playbackRange": { ... }
  },
  "assets": {
    "storage": "zip-package",
    "createdWith": "mvmnt/x.y.z",
    "minAppVersion": "...",
    "audio": { "byId": { ... } },
    "waveforms": { "byAudioId": { ... } },
    "fonts": { "byId": { ... } },
    "visual": { "byId": { "<id>": { "originalFileName", "mimeType", "byteLength", "hash" } } }
  },
  "references": { "audioIdMap": { ... } },
  "visualAssetRegistry": {
    "assets": { "<id>": { "id", "name", "filename" } },
    "assetsOrder": [...]
  },
  "compatibility": { "warnings": [...] }
}
```

---

## What works well

- **ZIP as container** is a good choice: allows binary payloads (audio, images, MIDI) without base64 inflation, is universally toolable (`unzip`, etc.), and the format is well-understood.
- **Stable asset UUIDs** decouple logical identity from filename — renaming a file doesn't break references.
- **SHA-256 hashes** on assets allow future integrity verification and content-addressed deduplication.
- **`schemaVersion` + `minAppVersion`** allows the importer to detect and handle incompatible versions gracefully.
- **`compatibility.warnings`** serialised into the document itself allows importers (and even file inspectors) to know about issues without running the full import pipeline.
- **Plugin dependencies declared** — the `plugins` array records what the scene needs to open, enabling tooling to pre-check requirements.

---

## Identified weaknesses and improvement opportunities

### 1. No top-level content manifest / index

The ZIP has no `manifest.json` that lists what files are present and their purposes. Tools that want to inspect a `.mvt` without parsing `document.json` in full cannot know which assets exist, what types they are, or their sizes.

**Improvement:** Add an `index.json` at the ZIP root that enumerates contained assets with their paths, types, and sizes. This enables:

- External inspection tools without needing the full app
- Faster partial loading (e.g., stream just audio without decoding the whole document)
- Format validation independent of app-specific schema logic

---

### 2. Asset metadata is split across two places

Visual asset metadata appears in two places:

- `assets.visual.byId` — technical metadata (filename, mimeType, byteLength, hash)
- `visualAssetRegistry` — user-facing metadata (display name, display filename, ordering)

These are synced during export but are semantically redundant. On import, both sections are read and merged.

**Improvement:** Merge into a single `assets.visual.byId` record that includes all fields: `{ id, name, originalFileName, mimeType, byteLength, hash, order? }`. Eliminate the separate `visualAssetRegistry` top-level key. This reduces the surface area for the two sections getting out of sync (as they can when plugin assets are involved — see bug report).

---

### 3. `midiCache` structure is opaque

MIDI data is stored as asset references (`{ assetId, assetRef }`) in the zip-package mode. The `assetRef` value is a relative path string (`assets/midi/<id>/track.mid`). This is essentially internal plumbing exposed in the document envelope.

**Improvement:** Store only the `assetId` in `midiCache`; let the importer derive the path via a well-known convention. Or use a dedicated `midi` top-level section parallel to `audio`, making the structure consistent and auditable.

---

### 4. `references.audioIdMap` is underdocumented

The `references` top-level key contains `audioIdMap`, which maps some form of audio ID. The purpose is not declared in the schema and requires reading the audio export code to understand.

**Improvement:** Either document this field inline (a `_comment` field in a schema file, or a JSDoc comment in the type definition) or rename it to be self-explaining (e.g., `audioLegacyIdRemap`). This is particularly important for future tooling that may need to interpret `.mvt` files without the full app source.

---

### 5. `sceneSettings` and `timeline.timeline` are untyped `any`

Both `scene.sceneSettings` and `timeline.timeline` are typed as `any` in the export envelope, even though they have well-defined shapes at runtime. This means:

- TypeScript provides no safety for serialisation/deserialisation
- Future migrations have no typed starting point to diff against
- External tooling cannot know what fields exist

**Improvement:** Define concrete interface types for both, even if they start as `Record<string, unknown>` with documented well-known fields. Wire these types into `SceneExportEnvelopeV6` so that TypeScript checks alignment between serialisation and deserialisation code.

---

### 6. No versioning on asset sections

Individual asset sections (`assets.audio`, `assets.visual`, etc.) have no independent version field. If the shape of an audio or visual asset record needs to change (e.g., adding a new codec hint field), there is no mechanism to express that without bumping the top-level `schemaVersion` — which triggers a full migration even if the change only affected audio metadata.

**Improvement:** Add an `assetSchemaVersion` (or per-section version) to allow asset sections to evolve independently of the scene schema. This enables lighter migrations: "audio section v2 → v3" without touching element bindings.

---

### 7. Plugin version constraints are permissive by default

Plugin version strings are stored as `^major.minor.0` semver ranges. This means a scene made with plugin v1.2.9 will accept any v1.x.x >= 1.2.0 without a warning, even if the plugin made breaking changes between patch versions (which semver technically allows within `^`).

**Improvement:** Store the exact version at which the scene was exported in `plugins[n].exactVersion` alongside the existing range. This allows stricter version-aware warning logic in the importer if needed, without changing current default behaviour.

---

### 8. No checksums on `document.json` itself

While individual asset payloads include SHA-256 hashes, `document.json` has no integrity check. A partially-written or corrupted ZIP would fail to parse, but a silently truncated or subtly corrupted JSON payload would only be detected at runtime.

**Improvement:** Add a top-level `documentHash` field (written last, after the rest of the envelope is stable) containing the SHA-256 of the serialised `document.json` bytes. On import, verify this before proceeding.

---

### 9. Audio feature caches are large and not independently cacheable

Audio feature caches (FFT/spectrogram data) can be megabytes and are tied to a specific audio file + analysis parameters. They are embedded in the ZIP alongside the scene, which means:

- The same audio file analysed in two scenes produces two independent (possibly identical) cache blobs
- There is no mechanism to share or reuse cache data across projects
- Exporting a scene re-serialises the entire cache even if nothing changed

**Improvement (longer-term):** Introduce a content-addressed audio feature cache store (keyed by `sha256(audio) + analysisParams`). Cache blobs would be stored externally to the scene ZIP and referenced by hash. The ZIP would store only the hash, allowing the app to check the local cache before re-analysing.

---

## Summary Table

| Issue                                       | Severity | Effort  | Value  |
| ------------------------------------------- | -------- | ------- | ------ |
| No content manifest/index                   | Medium   | Low     | High   |
| Split visual asset metadata                 | Low      | Medium  | Medium |
| Opaque midiCache structure                  | Low      | Low     | Medium |
| `audioIdMap` underdocumented                | Low      | Minimal | Low    |
| Untyped `sceneSettings`/`timeline.timeline` | Medium   | High    | High   |
| No per-section asset versioning             | Low      | Medium  | Medium |
| Plugin version range only                   | Low      | Minimal | Low    |
| No `document.json` checksum                 | Low      | Low     | Medium |
| Monolithic audio feature caches             | Medium   | High    | High   |

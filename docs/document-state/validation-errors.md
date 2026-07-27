# Validation Matrix – Import Guard

The validator enforces a fatal-only error code taxonomy. Any fatal error aborts import before store
mutation so corrupted scenes cannot reach runtime. Advisory warnings are planned but intentionally
deferred until the fatal path is fully covered.

| Code                       | Fatal | Condition                                    | Path Example                | Notes                                       |
| -------------------------- | ----- | -------------------------------------------- | --------------------------- | ------------------------------------------- |
| ERR_ROOT_TYPE              | yes   | Root is not an object                        | (root)                      | Parsing succeeded but structure invalid     |
| ERR_SCHEMA_VERSION         | yes   | Unsupported `schemaVersion`                  | schemaVersion               | Future migrations may widen support         |
| ERR_FORMAT                 | yes   | `format !== 'mvmnt.scene'`                   | format                      | Guards unexpected payloads                  |
| ERR_METADATA_MISSING       | yes   | `metadata` absent or not object              | metadata                    |                                             |
| ERR_METADATA_ID            | yes   | `metadata.id` missing or not string          | metadata.id                 |                                             |
| ERR_METADATA_NAME          | yes   | `metadata.name` missing or not string        | metadata.name               |                                             |
| ERR_SCENE_MISSING          | yes   | `scene` missing or not object                | scene                       |                                             |
| ERR_SCENE_ELEMENTS_TYPE    | yes   | `scene.elements` not an array                | scene.elements              |                                             |
| ERR_DUP_ELEMENT_ID         | yes   | Duplicate element id detected                | scene.elements[i].id        | Stops at first duplicate                    |
| ERR_TIMELINE_MISSING       | yes   | `timeline` root missing or not object        | timeline                    |                                             |
| ERR_TIMELINE_CORE_MISSING  | yes   | `timeline.timeline` sub-object missing       | timeline.timeline           | Holds core numeric fields                   |
| ERR_TRACKS_MISSING         | yes   | `timeline.tracks` missing or null            | timeline.tracks             |                                             |
| ERR_TRACKS_ORDER_TYPE      | yes   | `tracksOrder` not an array                   | timeline.tracksOrder        |                                             |
| ERR_TRACKS_ORDER_ITEM_TYPE | yes   | Non-string entry in `tracksOrder`            | timeline.tracksOrder[i]     | First offending index only                  |
| ERR_TRACKS_ORDER_REF       | yes   | `tracksOrder` references unknown track id    | timeline.tracksOrder[i]     | Early break on first missing reference      |
| ERR_TRACK_SHAPE            | yes   | Track object missing required fields         | timeline.tracks.<id>        | Basic shape only (id/name)                  |
| ERR_MIDI_CLIPS_SHAPE       | yes   | V8 MIDI clip array/field shape invalid       | timeline.tracks.<id>.clips  | Checks id/source/offset/regions             |
| ERR_MIDI_CLIP_SOURCE       | yes   | MIDI clip source missing from `midiCache`    | timeline.tracks.<id>.clips  |                                             |
| ERR_MIDI_CLIP_DUPLICATE    | yes   | Duplicate clip id within one MIDI track      | timeline.tracks.<id>.clips  |                                             |
| ERR_MIDI_CLIP_OVERLAP      | yes   | MIDI clips overlap on one track              | timeline.tracks.<id>.clips  | Requires available clip bounds              |
| ERR_AUDIO_TRACK_SHAPE      | yes   | V10 audio track has no clips array           | timeline.tracks.<id>.clips  | Audio placement is clips-only               |
| ERR_AUDIO_CLIP_SHAPE       | yes   | V10 audio clip fields or source trim invalid | timeline.tracks.<id>.clips  | Requires id/source/offset and valid seconds |
| ERR_AUDIO_LEGACY_FIELD     | yes   | Removed audio tick/source field is present   | timeline.tracks.<id>        | Import migrations remove pre-V10 fields     |
| ERR_GLOBAL_BPM_RANGE       | yes   | `globalBpm <= 0`                             | timeline.timeline.globalBpm | Range placeholder; may degrade later        |
| ERR_ROW_HEIGHT_RANGE       | yes   | `rowHeight` outside [8,400] when present     | timeline.rowHeight          | UI range guard                              |
| ERR_JSON_PARSE             | yes   | JSON.parse failed                            | (parse)                     | Raised in `importScene` pre-validation      |

## Result Object

```ts
interface ValidationError {
    code: ValidationErrorCode;
    message: string;
    path?: string;
}
interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
```

## Import Guard

`importScene(input)` migrates supported older schemas, then aborts without store mutation when
validation returns `ok === false`. Errors are projected into the import result with the same
`code` and `message`.

## Planned Warning Tier

Warnings will adopt `{ code, message, path }` shape for advisory recoverable issues (unknown element types, stale references, minor range deviations) without aborting import once the taxonomy is expanded beyond fatal errors.

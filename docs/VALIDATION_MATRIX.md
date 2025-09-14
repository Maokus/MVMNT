# Validation Matrix – Phase 2

Phase 2 introduces a fatal-only error code taxonomy. All errors abort import (no store mutation). Warnings remain empty (advisory tier deferred to Phase 6).

| Code                       | Fatal | Condition                                 | Path Example                | Notes                                       |
| -------------------------- | ----- | ----------------------------------------- | --------------------------- | ------------------------------------------- |
| ERR_ROOT_TYPE              | yes   | Root is not an object                     | (root)                      | Parsing succeeded but structure invalid     |
| ERR_SCHEMA_VERSION         | yes   | `schemaVersion !== 1`                     | schemaVersion               | Future: migrations may downgrade to warning |
| ERR_FORMAT                 | yes   | `format !== 'mvmnt.scene'`                | format                      | Guards unexpected payloads                  |
| ERR_METADATA_MISSING       | yes   | `metadata` absent or not object           | metadata                    |                                             |
| ERR_METADATA_ID            | yes   | `metadata.id` missing or not string       | metadata.id                 |                                             |
| ERR_METADATA_NAME          | yes   | `metadata.name` missing or not string     | metadata.name               |                                             |
| ERR_SCENE_MISSING          | yes   | `scene` missing or not object             | scene                       |                                             |
| ERR_SCENE_ELEMENTS_TYPE    | yes   | `scene.elements` not an array             | scene.elements              |                                             |
| ERR_DUP_ELEMENT_ID         | yes   | Duplicate element id detected             | scene.elements[i].id        | Stops at first duplicate                    |
| ERR_TIMELINE_MISSING       | yes   | `timeline` root missing or not object     | timeline                    |                                             |
| ERR_TIMELINE_CORE_MISSING  | yes   | `timeline.timeline` sub-object missing    | timeline.timeline           | Holds core numeric fields                   |
| ERR_TRACKS_MISSING         | yes   | `timeline.tracks` missing or null         | timeline.tracks             |                                             |
| ERR_TRACKS_ORDER_TYPE      | yes   | `tracksOrder` not an array                | timeline.tracksOrder        |                                             |
| ERR_TRACKS_ORDER_ITEM_TYPE | yes   | Non-string entry in `tracksOrder`         | timeline.tracksOrder[i]     | First offending index only                  |
| ERR_TRACKS_ORDER_REF       | yes   | `tracksOrder` references unknown track id | timeline.tracksOrder[i]     | Early break on first missing reference      |
| ERR_TRACK_SHAPE            | yes   | Track object missing required fields      | timeline.tracks.<id>        | Basic shape only (id/name)                  |
| ERR_GLOBAL_BPM_RANGE       | yes   | `globalBpm <= 0`                          | timeline.timeline.globalBpm | Range placeholder; may degrade later        |
| ERR_ROW_HEIGHT_RANGE       | yes   | `rowHeight` outside [8,400] when present  | timeline.rowHeight          | UI range guard                              |
| ERR_JSON_PARSE             | yes   | JSON.parse failed                         | (parse)                     | Raised in `importScene` pre-validation      |

## Result Object (Phase 2)

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

`importScene(json)` aborts (no store mutation) when `ok === false` after validation. Errors are projected into the import result with the same `code` & `message`.

## Future (Phase 6) Preview

Warnings will adopt `{ code, message, path }` shape for advisory recoverable issues (unknown element types, stale references, minor range deviations) without aborting import.

---

Generated as part of Phase 2 implementation (see improved_serialization_plan_v4.md).

# State Architecture – Phase 1 Status

Date: 2025-09-19

## Deliverables Implemented

-   `SCHEMA_VERSION = 1`
-   `DocumentRoot` minimal schema (`tracks`, `elements`, `meta`, timestamps)
-   ID generation (`generateId`) using `crypto.randomUUID()` fallback to counter
-   `createEmptyDocument()` producing fully-populated root
-   `migrate(raw)` handling: future version rejection, default filling, light normalization
-   Canonical serialization utilities (`canonicalize`) with key sorting & omission of `createdAt`/`modifiedAt`
-   Structural hash (`computeStructuralHash`) using FNV-1a over canonical string
-   Tests covering idempotent migration, identical empty doc hashes, hash volatility rules, future-version rejection, change detection

## Acceptance Criteria Mapping

| Criterion                             | Implementation Evidence                            |
| ------------------------------------- | -------------------------------------------------- |
| Idempotent migrate                    | Test: `migrate(createEmptyDocument())` hash stable |
| Two fresh empty docs share hash       | Test compares canonical + hash equality            |
| Non-ignored field change mutates hash | Test adding element changes hash                   |
| Volatile timestamp changes ignored    | Test modifies timestamps only, hash stable         |
| Future version rejected               | Test with `schemaVersion + 10` throws              |

## Assumptions / Notes

-   Volatile fields limited to `createdAt` & `modifiedAt`; future volatile additions must be added to omission list.
-   Normalization currently accepts either normalized object or proto-shapes with `items` arrays; minimal to support potential legacy inputs.
-   Hash function (32-bit FNV-1a variant) is intentionally simple; collision risk acceptable at current scale. Upgrade path: 64-bit FNV, xxHash, or SHA-256 if/when collisions appear or for user-visible integrity codes.
-   Validation beyond shape normalization is deferred to Phase 2 (e.g., referential integrity of `elementIds` within tracks not yet enforced).

## Next Steps (Phase 2 Preview)

Implement `validateDocument(doc)` to detect structural and referential errors, with tests for malformed shapes and duplicate IDs.

---

Generated automatically during Phase 1 completion.

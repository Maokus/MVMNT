# Channel Descriptor Removal – Sampling API Consolidation

**Status:** Draft (2025-10-21)
**Last reviewed:** 2025-10-21

## Summary

Adopt the proposal that feature sampling requests made with `(trackId, descriptor)` return all channels for the requested time or range. Scene elements that require a single channel will filter locally rather than depending on descriptor-level channel selection.

## Implementation Plan

1. **Descriptor & type updates**
   - Remove the optional `channel` field from `AudioFeatureDescriptor`, descriptor builders, and analysis intent helpers. Update relevant types, fixtures, and schema validations.
   - Ensure calculators advertise their full channel payloads via metadata so downstream consumers can reason about channel ordering when filtering locally.

2. **Sampling pipeline revisions**
   - Update `sampleFeatureFrame`, `getTempoAlignedFrame`, and any helpers that previously accepted a descriptor channel to always return the complete multi-channel payload.
   - Adjust cache keys (`featureSampleCache`, tempo-aligned caches) to be per-feature instead of per-channel. Include channel count metadata when storing cache entries.
   - Propagate the all-channel return shape to memoized selectors and React hooks (e.g., `useFeatureTrackSamples`) to avoid stale memoization assumptions.

3. **Scene element adjustments**
   - Audit scene elements for channel-specific logic. Provide utilities (e.g., `selectChannel(trackData, indexOrAlias)`) for elements that still need to render a specific channel.
   - Update templates and authoring presets to use the new helpers instead of relying on descriptor channels.

4. **Diagnostics & tooling**
   - Simplify diagnostics cache diffing to operate on `(calculator, profile)` keys. Remove per-channel expansion while surfacing channel metadata (counts, aliases) for visibility.
   - Update developer overlays to display aggregated channel info when relevant, highlighting when consumers down-select channels locally.

5. **Persistence migration**
   - Introduce a migration that strips `channel` fields from stored descriptors and records channel metadata separately if needed.
   - Verify backward compatibility by loading legacy projects and ensuring the new sampling payloads satisfy existing scenes.

6. **Testing & validation**
   - Extend unit and integration tests to confirm the sampling API returns multi-channel payloads and that filtering helpers work.
   - Add regression tests for calculators with asymmetric channels (e.g., mid/side) and for scenes filtering to a single channel post-change.

## Pros

- **Unified data retrieval** – Elements consistently receive the full calculator output, reducing descriptor permutations and simplifying cache keys.
- **Simpler API surface** – Eliminates descriptor-level channel selection, making descriptor identity match calculator profiles without extra qualifiers.
- **Improved diagnostics clarity** – Diagnostics focus on calculator/profile availability while still reporting channel metadata, avoiding channel-by-channel cache diff noise.
- **Future flexibility** – Local filtering enables custom channel combinations (e.g., sum of channels) without adding new descriptor variants.

## Cons

- **Increased payload size** – Always returning all channels may increase memory/CPU use for elements that previously requested a single channel.
- **Additional element responsibility** – Scene elements must filter channels themselves, introducing repetitive logic without shared helpers.
- **Potential migration complexity** – Persistence and diagnostics migrations must ensure legacy data without channel info still maps correctly to new structures.
- **Risk of inconsistent filtering** – Without strict descriptor definitions, different elements might implement conflicting channel selection logic, leading to inconsistent visuals.

## Open Questions

- Should we provide standardized filtering helpers or enforce a default (e.g., averaged mono) to reduce divergent implementations?
- How do we convey channel ordering and semantics (Left/Right, Mid/Side) in metadata so elements can select the right channel post-filtering?
- Do any external integrations rely on descriptor-level channel identity that would require compatibility shims?

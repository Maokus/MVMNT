# Removing Channel Granularity from Feature Descriptors

**Status:** Open questions (2025-10-21)
**Last reviewed:** 2025-10-21

## Context

- `AudioFeatureDescriptor` currently exposes an optional `channel` selector that downstream systems use to resolve numeric or alias-based channel identities. [src/audio/features/audioFeatureTypes.ts](../src/audio/features/audioFeatureTypes.ts)
- Scene elements derive cache keys and sampling logic from descriptor metadata, including channel, before calling `getTempoAlignedFrame`. [src/core/scene/elements/audioFeatureUtils.ts](../src/core/scene/elements/audioFeatureUtils.ts)
- Diagnostics expands cached feature tracks into per-channel descriptors so it can compare analysis intents, caches, and regenerations at a channel granularity. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts)
- Persistence already normalizes descriptor channel fields when loading historical data, indicating the project has handled channel shape changes before. [src/persistence/migrations/unifyChannelField.ts](../src/persistence/migrations/unifyChannelField.ts)

The proposal removes descriptor-level channel awareness so that analysis requests, caches, and diagnostics operate on the whole calculator output (per feature key/profile) instead of per channel slices.

## Potential Benefits

1. **Simpler descriptor identity and cache diffing** – With descriptors keyed by feature, calculator, and profile only, `analysisIntents` no longer needs to fold channel values into IDs and match keys. That reduces the permutations diagnostics must enumerate and should shrink the `descriptorsCached`/`missing` lists generated in `computeCacheDiffs`. [src/audio/features/analysisIntents.ts](../src/audio/features/analysisIntents.ts)
2. **Reduced cache bookkeeping** – Scene sampling caches (e.g., `featureSampleCache` keyed by channel and band) can collapse to per-feature entries, eliminating repeated cache population for each channel alias. [src/core/scene/elements/audioFeatureUtils.ts](../src/core/scene/elements/audioFeatureUtils.ts)
3. **Clearer state comparisons** – Diagnostics could compare `analysisIntents` against `AudioFeatureCache.featureTracks` directly without synthesizing additional descriptors for every alias or numeric channel. That aligns with the desire to reason about `(calculator, profile)` pairs instead of `(calculator, profile, channel)` triples. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts)
4. **Fewer migration edge cases** – Removing the field avoids repeated persistence migrations that coerce strings/numbers into consistent channel formats. Future format changes focus on calculator outputs instead of alias handling. [src/persistence/migrations/unifyChannelField.ts](../src/persistence/migrations/unifyChannelField.ts)
5. **Closer match to element usage** – Most scene elements sample a calculator’s merged output (`Mono` or averaged) rather than binding to a specific stereo channel. Aligning descriptor scope with actual usage may make analysis intents easier to reason about during authoring sessions.

## Trade-offs and Risks

1. **Loss of explicit per-channel intents** – Any element that genuinely needs a single channel (e.g., visualizing only the left envelope) would have to request all channels and filter locally. Without a declarative channel flag, diagnostics cannot flag that intent separately, and regenerations would rerun calculators even when one channel is stale but others are fine.
2. **Sampling API adjustments** – `sampleFeatureFrame` currently resolves channels and passes them to `getTempoAlignedFrame`. Removing descriptor channels requires a follow-up contract for callers to specify channel indices or a convention that calculators emit merged data. Otherwise elements that expect `channelIndex` support regress. [src/core/scene/elements/audioFeatureUtils.ts](../src/core/scene/elements/audioFeatureUtils.ts)
3. **Diagnostics UX regression risk** – The diagnostics panel lists missing descriptors using human-readable labels (`channel:X`). Eliminating channel granularity shortens the list, but it also hides which channel triggered a mismatch. Engineers debugging asymmetric calculators (e.g., mid/side splits) may lose visibility unless we add alternative metadata surfaces. [src/workspace/dev/developerOverlay/AudioDiagnosticsSection.tsx](../src/workspace/dev/developerOverlay/AudioDiagnosticsSection.tsx)
4. **Calculator compatibility** – Calculators that emit multi-channel payloads count on consumers to pick the right channel. If we change descriptors without updating calculators or adapters, callers might render the wrong data (e.g., always reading channel 0). We need to audit calculators for assumptions about descriptor channels. [src/audio/features/channelResolution.ts](../src/audio/features/channelResolution.ts)
5. **Profile/version accounting** – Today diagnostics differentiates caches using descriptor IDs that include channel. Dropping the field means stale detection must become profile-aware earlier; otherwise we risk marking caches as up-to-date even when only a subset of channels regenerated with a new version.

## Feasibility Considerations

1. **Type-level changes** – Update `AudioFeatureDescriptor`, descriptor builders, and analysis intent helpers to remove the `channel` property. This change ripples through TypeScript signatures, tests, fixtures, and any scene metadata that references descriptor channels. [src/audio/features/audioFeatureTypes.ts](../src/audio/features/audioFeatureTypes.ts)
2. **Scene sampling updates** – Replace channel-specific cache keys with per-feature keys and introduce an explicit sampling option (e.g., `samplingOptions.channelIndex`) or require calculators to publish merged channels. This affects `sampleFeatureFrame`, tempo-aligned adapters, and any memoization keyed by channel. [src/core/scene/elements/audioFeatureUtils.ts](../src/core/scene/elements/audioFeatureUtils.ts)
3. **Diagnostics overhaul** – Rebuild cache diffing to compare requested calculators versus available calculator outputs per profile. Remove channel expansion logic from `collectCachedDescriptorInfos` and adjust regeneration jobs that currently queue channel-qualified descriptor IDs. [src/state/audioDiagnosticsStore.ts](../src/state/audioDiagnosticsStore.ts)
4. **Persistence migration** – Add a schema migration that strips `channel` from saved descriptors, ensuring legacy projects load cleanly. The existing `migrateDescriptorChannels` helper offers a model for enumerating descriptors across stored caches. [src/persistence/migrations/unifyChannelField.ts](../src/persistence/migrations/unifyChannelField.ts)
5. **Calculator + adapter review** – Audit calculators that emit multi-channel payloads to confirm downstream consumers can still target specific data. If needed, expose calculator metadata that identifies primary/auxiliary channels or provide sampling helpers that accept channel selection outside descriptor identity.
6. **Testing & tooling** – Update diagnostics fixtures, automation scripts, and developer overlays that assume channel-qualified descriptor IDs. This includes developer tooling that surfaces `channel:` tags in cache diffs. [src/workspace/dev/developerOverlay/AudioDiagnosticsSection.tsx](../src/workspace/dev/developerOverlay/AudioDiagnosticsSection.tsx)

## Open Questions

- Should we introduce a new runtime sampling option (`channelIndex`) so elements can still request individual channels without polluting descriptor identity?
- How do we convey calculator outputs that are inherently multi-channel (e.g., mid/side) so authors know which channel to sample post-refactor?
- Can diagnostics derive equivalent visibility by tracking per-channel metadata (e.g., channel counts, aliases) without storing them in descriptors?
- Do any existing scene elements or custom automations rely on descriptor channel strings ("Left", "Right") for template serialization that would break without additional migration support?

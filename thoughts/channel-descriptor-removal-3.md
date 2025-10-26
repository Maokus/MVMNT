# Channel Descriptor Removal – Detailed Execution Plan

**Status:** Draft (2025-10-21)
**Last reviewed:** 2025-10-21

This version expands on [`channel-descriptor-removal-2.md`](./channel-descriptor-removal-2.md) with a concrete, phase-based roadmap that maps the conceptual decisions to specific modules inside the repository. The phases below should be executed sequentially; each lists blocking dependencies and verification steps before moving forward.

## Phase 1 – Type pruning & metadata surfacing

**Goal:** Eliminate descriptor-level channel selectors and expose channel metadata required for downstream filtering.

- Update `AudioFeatureDescriptor` in [`src/audio/features/audioFeatureTypes.ts`](../src/audio/features/audioFeatureTypes.ts) to remove the `channel` property and document that descriptors are channel-agnostic. Introduce a lightweight `ChannelLayoutMeta` shape on `AudioFeatureTrack` (e.g., `{ aliases?: string[]; semantics?: 'stereo' | 'mid-side' | ... }`) if additional semantics are required for filtering helpers.
- Refactor descriptor builders in [`src/audio/features/descriptorBuilder.ts`](../src/audio/features/descriptorBuilder.ts) and intent helpers in [`src/audio/features/analysisIntents.ts`](../src/audio/features/analysisIntents.ts) to stop accepting channel overrides. Delete helper branches that infer default channel aliases.
- Sweep persistence-facing types and fixtures (`src/persistence/migrations/*.ts`, [`src/persistence/__fixtures__`](../src/persistence/__fixtures__)) to remove `channel` expectations. Add fixture coverage for channel metadata (aliases, counts) so migrations can validate payloads post-change.
- Update docs in [`docs/audio/audio-cache-system.md`](../docs/audio/audio-cache-system.md) and [`docs/audio/quickstart.md`](../docs/audio/quickstart.md) to clarify that channel selection is a runtime concern.
- Tests: run focused type-checks by updating `AudioFeatureDescriptor` imports in unit tests under [`src/audio/features/__tests__`](../src/audio/features/__tests__) and [`src/core/scene/elements/__tests__`](../src/core/scene/elements/__tests__). Confirm snapshots (if any) no longer serialize a `channel` field.

## Phase 2 – Sampling pipeline restructuring

**Goal:** Ensure all sampling utilities fetch and return complete multi-channel payloads without descriptor-driven filtering.

- Rewrite `sampleFeatureFrame` in [`src/core/scene/elements/audioFeatureUtils.ts`](../src/core/scene/elements/audioFeatureUtils.ts) to:
  - Drop `resolveDescriptorChannel` usage and delete channel-specific cache keys.
  - Cache samples using a `(featureKey, bandIndex, tick)` signature. Store the `values` as a multidimensional array (e.g., `number[][]`) or a struct with `channels` metadata so callers can select channels locally.
  - Record per-sample metadata (channel count, aliases) in the cached object to avoid repeated lookups.
- Update `getTempoAlignedFrame` in [`src/audio/features/tempoAlignedViewAdapter.ts`](../src/audio/features/tempoAlignedViewAdapter.ts) to stop accepting `channelIndex` in `TempoAlignedFrameOptions`. Instead, always return every channel for the computed frame. Adjust helper functions (`readNumericFrame`, waveform adapters) so they iterate across channel counts when populating the `values` array.
- Remove `resolveDescriptorChannel` and the supporting `TrackChannelConfig` logic unless still needed for legacy fallbacks. Replace with a new helper (`buildChannelMetadata(track, cache)`) that aggregates alias information and exposes it in the sample payload.
- Update memoized selectors in [`src/state/selectors/audioFeatureSelectors.ts`](../src/state/selectors/audioFeatureSelectors.ts) (and related hooks such as `useFeatureTrackSamples` in [`src/audio/features/sceneApi.ts`](../src/audio/features/sceneApi.ts)) to expect multi-channel samples. Ensure selectors no longer memoize on descriptor channel identity.
- Tests: expand coverage in [`src/audio/features/__tests__/audioSamplingOptions.test.ts`](../src/audio/features/__tests__/audioSamplingOptions.test.ts) and [`src/export/__tests__/audio-feature-export-parity.test.ts`](../src/export/__tests__/audio-feature-export-parity.test.ts) to assert that the returned samples include all channels and expose channel metadata.

## Phase 3 – Scene utilities & element filtering

**Goal:** Provide ergonomic helpers so scene elements can target individual channels after sampling.

- Introduce a `selectChannelSample(sample, selector)` helper in [`src/core/scene/elements/audioFeatureUtils.ts`](../src/core/scene/elements/audioFeatureUtils.ts) (or a sibling module) that resolves numeric indices or aliases using the metadata emitted in Phase 2.
- Audit scene elements that currently pass descriptor-level channel overrides, including [`src/core/scene/elements/audio-locked-oscilloscope.ts`](../src/core/scene/elements/audio-locked-oscilloscope.ts) and utilities under [`src/core/scene/elements/audioFeatureElements`](../src/core/scene/elements), to replace direct descriptor channels with calls to the new helper.
- Update scene templates and presets in [`src/state/sceneStore.ts`](../src/state/sceneStore.ts) to store channel selection hints separately from descriptors (e.g., attach to element settings). Migrate any constants that clone descriptors with different channels.
- Ensure timeline bindings in [`src/state/scene/sceneBindings.ts`](../src/state/scene/sceneBindings.ts) (and related selectors) propagate channel selection metadata alongside descriptors so authoring surfaces can still present channel pickers.
- Tests: extend `audioElements.test.ts` under [`src/core/scene/elements/__tests__`](../src/core/scene/elements/__tests__) to verify that per-channel rendering still works when selecting via the new helper.

## Phase 4 – Diagnostics, caches & tooling

**Goal:** Align diagnostics, cache identity, and developer tooling with the multi-channel sampling contract.

- Refactor `featureSampleCache` and related diagnostics in [`src/state/audioDiagnosticsStore.ts`](../src/state/audioDiagnosticsStore.ts) to key entries by `(trackId, descriptorId)` only. Attach channel metadata (counts, aliases) to `descriptorDetails` records so the developer overlay can highlight available channels.
- Update migration utilities such as [`src/persistence/migrations/unifyChannelField.ts`](../src/persistence/migrations/unifyChannelField.ts) to strip channel selectors and persist channel metadata separately when available.
- Revise the developer overlay UI in [`src/workspace/dev/developerOverlay/AudioDiagnosticsSection.tsx`](../src/workspace/dev/developerOverlay/AudioDiagnosticsSection.tsx) to show aggregated channel info (e.g., “3 channels · aliases: Left, Right, LFE”) and note when scene elements filter locally.
- Simplify cache diff tooling under [`scripts/audio/cache-diff`](../scripts/audio/cache-diff) (if present) or the corresponding utilities referenced in `package.json` scripts so per-channel expansion is removed.
- Tests: add assertions in diagnostics store tests (`src/state/__tests__` if present) to confirm cache keys collapse across channels and metadata is surfaced.

## Phase 5 – Persistence migration & regression suite

**Goal:** Ensure stored projects upgrade cleanly and behavior remains stable.

- Introduce a dedicated migration (e.g., `audioSystemV5`) in [`src/persistence/migrations`](../src/persistence/migrations) that iterates through stored descriptors, removes `channel`, and stores channel hints within element configuration blocks. Reuse helper functions from Phase 3 to normalize channel selectors.
- Update save/load flows in [`src/persistence/workspaceSerializer.ts`](../src/persistence/workspaceSerializer.ts) (or equivalent) so new projects emit channel metadata in the correct place.
- Write integration tests that load legacy fixtures (`src/persistence/__fixtures__/legacyProjects`) and assert that:
  - Descriptors no longer include `channel` after migration.
  - Scene elements still render the expected channel via the new helper when a selector is present.
- Extend automated regression coverage for calculators with asymmetric channels (e.g., mid/side) by adding targeted fixtures under [`src/audio/features/__fixtures__`](../src/audio/features/__fixtures__) and verifying post-migration filtering yields the correct channel.
- Final QA: run the full verification suite (`npm run test`, `npm run build`, `npm run lint`) and perform exploratory testing in the developer overlay to confirm diagnostics display multi-channel metadata without channel-specific cache entries.

**Update (2025-10-21):** Phase 5 shipped via [`audioSystemV5`](../src/persistence/migrations/audioSystemV5.ts), which migrates
channel selectors into scene configuration, rewrites persistence fixtures, and adds asymmetric channel coverage in
[`src/audio/features/__fixtures__/mid-side-frame.json`](../src/audio/features/__fixtures__/mid-side-frame.json).

## Dependencies & sequencing

- Phases 1 and 2 are tightly coupled; do not attempt to restructure sampling until type changes compile cleanly.
- Phase 3 depends on the new sample payload shape from Phase 2. Any persistence or diagnostics work should wait until helpers are stable to avoid churn.
- Schedule migrations (Phase 5) once diagnostics confirm the runtime system no longer depends on descriptor channels.

## Open Questions carried forward

The questions listed in [`channel-descriptor-removal-2.md`](./channel-descriptor-removal-2.md#open-questions) still apply. As phases progress, capture resolved items in a follow-up entry or migrate finalized decisions into `/docs` alongside implementation notes.

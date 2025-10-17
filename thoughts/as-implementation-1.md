# Audio Cache Simplification Implementation Plan

_Status: Planning_

Original proposal: [audiosystem-simplification-1.md](./audiosystem-simplification-1.md)

## Context snapshot
- `AudioFeatureDescriptor` currently exposes both `channelIndex` and `channelAlias`, along with other optional fields that new APIs should hide from routine callers.【F:src/audio/features/audioFeatureTypes.ts†L19-L26】
- Scene utilities manually coerce descriptors, publish intents, and resolve aliases before delegating to tempo-aligned sampling, reinforcing the multi-step workflow the simplification aims to remove.【F:src/core/scene/elements/audioFeatureUtils.ts†L45-L213】
- Scene elements such as `audio-spectrum` explicitly emit intents and sample frames during rendering, so any higher-level API must integrate with (or replace) these code paths.【F:src/core/scene/elements/audio-spectrum.ts†L916-L934】

## Implementation roadmap
### 1. Unify channel identifiers
- Introduce a single `channel` field on descriptors that accepts either a number or string while preserving compatibility in the persistence layer (cache metadata still retains `channelAliases`). Start by updating the type definition and helper builders in `audioFeatureTypes.ts` and `analysisIntents.ts` while providing transitional shims that map legacy `channelIndex`/`channelAlias` inputs into the new structure.【F:src/audio/features/audioFeatureTypes.ts†L19-L58】【F:src/audio/features/analysisIntents.ts†L31-L89】
- Refactor descriptor coercion helpers and sample caching logic to rely on a unified resolver that understands the new `channel` field but still decodes cached aliases; update cache keys and selectors to avoid divergent fingerprints during rollout.【F:src/core/scene/elements/audioFeatureUtils.ts†L45-L213】
- Adjust forms (`AudioFeatureDescriptorInput`) and diagnostics stores to read/write the unified field, adding migration logic when hydrating legacy descriptors from scene configurations or serialized state.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L228-L818】【F:src/state/audioDiagnosticsStore.ts†L128-L217】

### 2. Simplify descriptor defaults and calculator selection
- Centralize descriptor defaulting in a single utility (e.g., `normalizeFeatureRequest`) that fills in feature key, smoothing, calculator ID, and band values using registry metadata; replace scattered `coerceFeatureDescriptor(s)` calls in scene elements and diagnostics with the new helper.【F:src/core/scene/elements/audioFeatureUtils.ts†L45-L73】
- Update the analysis intent publisher to assume the default profile ID unless explicitly provided, and collapse redundant parameters in callers so that the common path becomes “track + feature (+ optional channel/smoothing)”.【F:src/audio/features/analysisIntents.ts†L64-L89】
- Ensure advanced calculators can still surface optional knobs by extending the helper to accept overrides (e.g., calculator ID), but hide these from default UI controls; verify storybook or editor schemas expose only the simplified inputs by default.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L228-L547】

### 3. Provide a higher-level scene consumption API
- Create a façade module (e.g., `@audio/features/sceneApi`) that offers imperative helpers such as `requestFeature(trackId, feature, options)` and `sampleFeature(trackId, feature, time)`; internally, hook into the existing intent bus and tempo-aligned sampling so current scheduling infrastructure stays intact.【F:src/audio/features/analysisIntents.ts†L64-L107】【F:src/core/scene/elements/audioFeatureUtils.ts†L75-L213】
- Update scene element base utilities (`audioFeatureUtils`, individual elements, and potential React hooks) to adopt the façade, removing direct calls to `emitAnalysisIntent` and manual descriptor munging where practical while keeping fallbacks for custom descriptors during transition.【F:src/core/scene/elements/audio-spectrum.ts†L916-L999】【F:src/core/scene/elements/audio-oscilloscope.ts†L140-L559】【F:src/core/scene/elements/audio-volume-meter.ts†L93-L364】
- Offer a React-friendly hook or helper that binds lifecycle cleanup automatically (e.g., unregistering intents when components unmount) and surface diagnostics when data is pending or unavailable to maintain current user feedback affordances.【F:src/core/scene/elements/audioFeatureUtils.ts†L75-L213】【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L353-L818】

### 4. Migration, testing, and documentation
- Add compatibility adapters to ingest legacy scene configurations, transforming stored descriptors on load/save so existing projects render without manual edits; cover both scene store hydration and any persistence serializers under `src/state` and `src/persistence`.【F:src/state/sceneStore.ts†L39-L320】【F:src/persistence/AGENTS.md†L1-L3】
- Extend automated tests covering descriptor inputs, diagnostics, and sampling to reflect the new API surface, ensuring both old and new descriptor shapes are accepted during rollout; prioritize updates to `AudioFeatureDescriptorInput` tests and any selectors that compute cache usage.【F:src/workspace/form/inputs/__tests__/AudioFeatureDescriptorInput.test.tsx†L4-L244】【F:src/state/audioDiagnosticsStore.ts†L128-L217】
- Revise developer-facing documentation (`docs/audio/audio-cache-system.md`) to describe the simplified workflow and cross-link from this plan when the implementation ships, aligning terminology with the new APIs and highlighting migration notes.【F:docs/audio/audio-cache-system.md†L311-L517】【F:thoughts/AGENTS.md†L1-L6】

## Acceptance criteria
1. Unified descriptor schema is the only shape emitted by scene utilities and persisted state; legacy descriptors continue to deserialize correctly, and cache/analysis fingerprints remain stable for unchanged feature requests.【F:src/audio/features/audioFeatureTypes.ts†L19-L58】【F:src/state/sceneStore.ts†L39-L320】
2. Default workflows for built-in scene elements require at most one call (or hook invocation) to obtain feature data, with intents fired implicitly and teardown automated; manual intent management remains available for edge cases via documented escape hatches.【F:src/core/scene/elements/audio-spectrum.ts†L916-L999】【F:src/core/scene/elements/audioFeatureUtils.ts†L75-L213】
3. UI editors and diagnostics tooling surface simplified descriptor fields by default, while advanced options remain accessible through explicit “advanced” affordances; updated tests cover both configurations.【F:src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx†L228-L547】【F:src/workspace/form/inputs/__tests__/AudioFeatureDescriptorInput.test.tsx†L4-L244】
4. Documentation in `docs/audio/audio-cache-system.md` and accompanying release notes explain the new APIs, link back to this implementation plan, and outline steps for migrating custom scene elements.【F:docs/audio/audio-cache-system.md†L311-L517】【F:thoughts/AGENTS.md†L1-L6】

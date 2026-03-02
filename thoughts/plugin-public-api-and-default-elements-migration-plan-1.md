# Plugin Public API + Default Elements Migration Plan

## Goal
Create a stable, versioned host plugin API so plugins never import internal app store/selectors directly, and migrate default scene elements to use the same API as canonical reference implementations.

## Why
- Prevent dev-vs-packaged behavior drift caused by bundled state duplication.
- Reduce plugin breakage from internal refactors.
- Give plugin developers one clear contract instead of implicit internal dependencies.
- Make built-in elements trustworthy examples for plugin authors.

---

## Target Architecture

### 1) Public host API surface (single contract)
- Introduce a single namespace (e.g. `globalThis.MVMNT.plugins`) with versioning:
  - `apiVersion: "1.0.0"`
  - `capabilities: string[]`
- Expose only intentionally supported methods/types:
  - Timeline read APIs (`getStateSnapshot`, `selectNotesInWindow`, `getTrackById`, etc.)
  - Audio feature read APIs (`sampleFeatureAtTime`, `sampleFeatureRange`)
  - Utility APIs (note-name helpers, timing helpers)
- No direct export of app internals unless wrapped by stable adapters.

### 2) Adapter layer in host app
- Add a dedicated host adapter module that maps internal store/selectors to public API methods.
- Keep adapter methods pure/stable and typed.
- Handle null/unsupported capabilities with explicit return values.

### 3) Contract + compatibility rules
- Semantic versioning for plugin API (`major.minor.patch`).
- Backward-compat policy:
  - Same major: non-breaking additions only.
  - Breaking changes require major bump and deprecation window.
- Runtime guard in plugins for unsupported versions/capabilities.

### 4) Default elements as reference clients
- Refactor built-in/default scene elements to consume the same public plugin API methods.
- Avoid direct internal store/selectors in element code where plugin-equivalent API exists.
- Keep internal fast paths only behind the same public adapter boundary.

---

## Phased Implementation Plan

## Phase 0 — Inventory + API boundary definition
**Outcome:** exact list of internal dependencies used by plugins/default elements and proposed public replacements.

Tasks:
1. Audit plugin elements and default elements for imports from `@state/*`, `@selectors/*`, and similar internals.
2. Group usage into capability domains:
   - MIDI/timeline
   - Audio features
   - Timing/conversion
3. Draft `PluginAPI v1` method list with input/output types and error behavior.
4. Define what remains internal and out-of-scope for v1.

Acceptance criteria:
- One markdown spec describing all v1 methods and capability names.
- Every currently-used internal call is mapped to a public API method or explicitly deferred.

---

## Phase 1 — Implement host adapter and versioned global API
**Outcome:** host exposes a stable, typed `MVMNT.plugins` API.

Tasks:
1. Create host adapter module (e.g. `src/plugins/host-api/plugin-api.ts`):
   - Wrap timeline store/selectors.
   - Wrap audio sampling helpers.
2. Add global bootstrap in app startup:
   - `globalThis.MVMNT.plugins = { apiVersion, capabilities, timeline, audio, timing }`.
3. Add runtime invariants/logging for missing dependencies.
4. Add minimal tests for adapter behavior (happy path + missing capability path).

Acceptance criteria:
- Public API exists and is discoverable at runtime.
- No plugin code needs direct import from internal app state/selectors for supported use-cases.

---

## Phase 2 — Migrate plugin templates + sample plugins
**Outcome:** generated and sample plugin elements use only public API.

Tasks:
1. Update all element templates under `_templates` to use public API resolver helpers.
2. Add reusable helper in templates:
   - `getPluginHostApi(requiredCapabilities?)`.
3. Migrate sample/custom plugin elements to the helper.
4. Update fallback messages to be capability-specific (e.g. "Timeline API unavailable").

Acceptance criteria:
- Template-generated elements never import `@state/*` or `@selectors/*`.
- Sample plugins demonstrate capability checks + graceful fallback.

---

## Phase 3 — Migrate default scene elements to same API
**Outcome:** built-in elements become first-class reference implementations for plugin developers.

Tasks:
1. Prioritize built-ins that read timeline/audio state directly:
   - MIDI displays (`movingNotesPianoRoll`, `timeUnitPianoRoll`, trackers)
   - Audio displays (`audioSpectrum`, `audioVolumeMeter`, `audioWaveform`, `audioLockedOscilloscope`)
2. Replace direct internal access with calls through the host adapter/public API module.
3. Keep performance parity by optimizing adapter internals, not bypassing API.
4. Add comments/docs: "This element intentionally uses the public plugin API as reference pattern."

Acceptance criteria:
- Built-ins in scope no longer call internal state/selectors directly.
- Developers can copy built-in patterns into plugins without runtime mismatch.

---

## Phase 4 — Documentation + developer guidance
**Outcome:** plugin authors have clear docs and migration guidance.

Tasks:
1. Add docs page: "Plugin API v1" with method examples.
2. Add migration guide:
   - "Do not import app internals"
   - old pattern -> new pattern mapping.
3. Add "reference elements" section pointing to migrated default elements.
4. Add troubleshooting section for capability/version mismatch.

Acceptance criteria:
- New plugin developer can build MIDI/audio elements using docs only.
- Docs explicitly separate public API from internal modules.

---

## Phase 5 — Enforcement + safety rails
**Outcome:** regressions are prevented automatically.

Tasks:
1. Add lint/CI rule for plugin/template folders disallowing imports from internal modules (`@state/*`, `@selectors/*`, etc.).
2. Add static check script for forbidden imports in plugin-facing code.
3. Add runtime warning in dev when plugin module appears to access known internal paths.
4. Add CI checks validating built plugin bundles include expected public API usage markers.

Acceptance criteria:
- CI fails on reintroduction of forbidden import patterns.
- New regressions are caught before release.

---

## Suggested Work Breakdown (tickets)
1. **Spec:** Plugin API v1 contract + capabilities.
2. **Host:** adapter module + global bootstrap + typings.
3. **Templates:** migrate all `_templates` + shared helper.
4. **Built-ins (MIDI):** migrate MIDI display elements.
5. **Built-ins (Audio):** migrate audio display elements.
6. **Docs:** API guide + migration guide + references.
7. **Guardrails:** lint rule + CI scan + runtime warnings.

---

## Risks and Mitigations
- **Risk:** performance regressions from abstraction.
  - **Mitigation:** benchmark pre/post; optimize within adapter layer.
- **Risk:** API too small for real plugin needs.
  - **Mitigation:** capability-based incremental additions (minor versions).
- **Risk:** accidental breaking changes.
  - **Mitigation:** semver policy + contract tests + deprecation period.

---

## Done Definition (program-level)
- Plugin API is versioned and documented.
- Templates and sample plugins only use public API.
- Default scene elements in scope use the same API patterns.
- CI prevents direct internal-store/selector usage in plugin-facing code.
- Packaged plugin behavior matches dev behavior for MIDI/audio lookup paths.

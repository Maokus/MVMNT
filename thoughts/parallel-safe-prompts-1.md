These are parallel safe prompts with non overlapping workstreams and explicit file ownership. Respect constraints. WRMP stands for webgl render migration plan, avp stands for audio visualisation plan. If you need the big picture, read the relevant documents in /thoughts.

**Shared-document handoff:** Implementation prompts should not edit `wrmp-p2-planning.md`, `renderer-contract.md`, or release notes directly. Instead, drop structured notes into per-prompt files (e.g. `thoughts/wrmp-p2-notes/prompt-<letter>.md`, `docs/renderer-contract/drafts/prompt-<letter>.md`, `docs/release-notes-drafts/prompt-<letter>.md`). Dedicated documentation prompts later in the sequence will merge those drafts, ensuring a single-writer flow.

## Phase: WRMP P2 Implementation

### Prompt A — Adapter Interfaces & Geometry Types

-   **Objective:** Finalize and land the adapter interface that maps legacy `RenderObject` properties to GPU payloads.
-   **Scope:** Work in `src/core/render/webgl/adapters/*`, define TypeScript interfaces for geometry payloads (rect, line, sprite, particle), document buffer usage patterns. Update or create focused unit tests under `src/core/render/__tests__/webgl-adapters`.
-   **Constraints:** Avoid touching primitive-specific render code (`webgl/primitives/*`) or text pipeline files. Coordinate TypeScript definitions via renderer-contract.md appendices if needed.
-   **Deliverables:** Merged adapter interfaces behind feature flag, passing tests, structured summary dropped in `thoughts/wrmp-p2-notes/prompt-a.md` (new file, follow shared template).

### Prompt B — Rectangle & Line Primitive Ports

-   **Objective:** Port rectangle and line render objects to WebGL instanced buffers with shared shaders.
-   **Scope:** Implement in `src/core/render/webgl/primitives/rect.ts` and `line.ts`, adjust related shader sources under `src/core/render/webgl/shaders`. Update regression scenes or fixtures specific to these shapes if required.
-   **Constraints:** Do not modify adapter interfaces (Prompt A) or image/particle/text primitives. Share shader constants via newly created module if absent.
-   **Deliverables:** Deterministic rendering verified via existing snapshot harness (`webgl-renderer.phase1.test.ts`) extended with new cases, performance notes captured in `thoughts/wrmp-p2-notes/prompt-b.md` for the synthesizer.

### Prompt C — Image & Atlas-Based Sprites

-   **Objective:** Port image primitives to WebGL with texture atlas bindings.
-   **Scope:** Work within `src/core/render/webgl/primitives/image.ts`, texture managers under `src/core/render/webgl/textures`, and any supporting loaders. Add targeted tests in `__tests__/webgl-image-primitives`.
-   **Constraints:** Leave particle systems and glyph/text logic untouched. Coordinate only via shared enums/constants introduced by Prompt A.
-   **Deliverables:** Export parity snapshots for image-heavy scenes, documentation snippet in mvt-asset-packaging.md describing atlas expectations.

### Prompt D — Particle Systems GPU Path

-   **Objective:** Introduce per-instance attribute buffers for particle render objects.
-   **Scope:** Update `src/core/render/webgl/primitives/particle.ts`, scheduler hooks under `src/core/render/webgl/runtime`, and add simulation fixtures/tests.
-   **Constraints:** No changes to glyph/text files, adapters established by Prompt A, or shared shader code owned by Prompt B unless new uniforms are required (coordinate via shared module).
-   **Deliverables:** Passing deterministic tests for particle scenes, telemetry and perf deltas recorded in `thoughts/wrmp-p2-notes/prompt-d.md`.

### Prompt E — Glyph Atlas Text Pipeline

-   **Objective:** Build WebGL text rendering using glyph atlases.
-   **Scope:** Implement in `src/core/render/webgl/text/*`, integrate with existing font loader, add atlas eviction metrics. Extend tests in `__tests__/webgl-text-pipeline`.
-   **Constraints:** Do not modify primitive adapters or non-text primitives. Any shared constants go through a new `webgl/text/constants.ts`.
-   **Deliverables:** Snapshot parity for text-heavy scenes, diagnostics notes captured in `thoughts/wrmp-p2-notes/prompt-e.md`.

### Prompt F — Resource Diagnostics & Tooling

-   **Objective:** Instrument buffer/texture lifecycle and surface diagnostics.
-   **Scope:** Focus on `src/core/render/webgl/diagnostics/*`, create overlays or CLI tooling if needed, add automated leak tests.
-   **Constraints:** Avoid editing primitive implementations unless adding hook points; request adapters via dependency injection where necessary.
-   **Deliverables:** Diagnostics overlay/screens landed with automated tests, raw documentation draft saved to `docs/renderer-contract/drafts/prompt-f.md` and planning roll-up notes in `thoughts/wrmp-p2-notes/prompt-f.md`.

_Run all updated unit tests relevant to each workstream; if a prompt adds new primitives or shaders, ensure snapshot tests are updated without altering others’ fixtures._

## Phase: WRMP P3 Planning

### Prompt G — Scene Integration Planning Packet

-   **Objective:** Produce the detailed plan for Phase 3 integration, covering feature flags, runtime wiring, and testing strategy.
-   **Scope:** Work solely in the Phase 3 section of `webgl-render-migration-plan.md` and optionally draft supporting diagrams in docs. Pull P2 outcomes from `thoughts/wrmp-p2-notes/*` as references without editing those sources.
-   **Constraints:** No code changes; limit edits in the planning doc to the Phase 3 section.
-   **Deliverables:** Reviewed and cross-linked plan with clearly enumerated tasks, dependencies, and success criteria, plus a synthesized wrap-up exported to `thoughts/wrmp-p2-notes/synth-phase2.md` for handoff.

### Prompt H — Feature Flag Rollout Spec

-   **Objective:** Author the rollout/telemetry spec for enabling WebGL in scenes.
-   **Scope:** Create/update a spec in docs (e.g., `docs/webgl-rollout.md`) detailing runtime flag strategy, QA gates, and migration checklist.
-   **Constraints:** Do not overlap with Prompt G’s planning doc edits; cross-reference via links only.
-   **Deliverables:** Signed-off spec ready for implementation agents.

## Phase: WRMP P3 Implementation

### Prompt I — SceneRuntimeAdapter Integration

-   **Objective:** Update `SceneRuntimeAdapter` to target the shared renderer contract and expose the WebGL flag.
-   **Scope:** Modify `src/core/runtime/scene-runtime-adapter.ts`, introduce shared flag constants in `src/core/runtime/renderer-flags.ts`, update related config files, and add tests ensuring dual renderer support.
-   **Constraints:** Avoid touching renderer primitives (Phase 2 outputs); publish the flag name exclusively through `renderer-flags.ts` for Prompt J to consume.
-   **Deliverables:** Passing tests, integration notes captured in `docs/renderer-contract/drafts/prompt-i.md` for consolidation.

### Prompt J — VisualizerCore Wiring & Diagnostics

-   **Objective:** Wire `VisualizerCore` to switch renderers and emit instrumentation (frame time, hashes).
-   **Scope:** Touch visualizer-core.ts, diagnostics modules, and add telemetry test coverage.
-   **Constraints:** No modifications to SceneRuntimeAdapter logic implemented by Prompt I; import the shared flag constant from `src/core/runtime/renderer-flags.ts` without redefining it.
-   **Deliverables:** Instrumented runtime with deterministic metrics, docs draft stored in `docs/renderer-contract/drafts/prompt-j.md` outlining telemetry hooks.

### Prompt K — Export Pipeline Compatibility

-   **Objective:** Ensure export flows use WebGL renderer deterministically.
-   **Scope:** Update exporter modules under `src/export/*`, add regression tests comparing Canvas vs. WebGL exports.
-   **Constraints:** Do not edit runtime wiring from Prompts I/J; reuse renderer factory APIs.
-   **Deliverables:** Passing export determinism tests, release-note draft written to `docs/release-notes-drafts/prompt-k.md`.

## Phase: WRMP Documentation (P1–P3)

### Prompt L — Technical Documentation Consolidation

-   **Objective:** Compile completed work into comprehensive documentation and merge note files from earlier prompts.
-   **Scope:** Read all drafts under `thoughts/wrmp-p2-notes/`, `docs/renderer-contract/drafts/`, and `docs/release-notes-drafts/`, then apply curated updates to `wrmp-p2-planning.md`, `renderer-contract.md`, and release notes. Add diagrams if needed.
-   **Constraints:** Treat this as the sole writer for those shared docs; trim or archive consumed drafts once merged to keep the queue clear.
-   **Deliverables:** Polished documentation committed, redundant drafts removed or marked processed, changelog entry in `RELEASE_NOTES_AUDIO_FEATURE_BINDINGS.md` if impacted.

### Prompt M — Developer Onboarding Guide

-   **Objective:** Produce a practical onboarding guide for engineers switching to WebGL renderer.
-   **Scope:** Add `docs/webgl-developer-onboarding.md` covering setup, debugging, tests.
-   **Constraints:** Avoid duplicating content from Prompt L; reference sections via links.
-   **Deliverables:** Guide with table of contents, ready for design review.

## Phase: WRMP P4 Planning

### Prompt N — Canvas Decommission Strategy

-   **Objective:** Plan Phase 4 tasks for retiring Canvas renderer.
-   **Scope:** Update webgl-render-migration-plan.md Phase 4, add dependency matrix, risk mitigations.
-   **Constraints:** No code edits; coordinate with Prompt O via shared outline headings agreed beforehand.
-   **Deliverables:** Clear milestone checklist and success metrics.

### Prompt O — Telemetry & Rollout Governance Plan

-   **Objective:** Draft governance doc defining telemetry thresholds, rollout gates for Canvas retirement.
-   **Scope:** Create `docs/webgl-rollout-governance.md`.
-   **Constraints:** Reference (not modify) documents touched in Prompt N.
-   **Deliverables:** Approved governance plan.

## Phase: WRMP P4 Implementation

### Prompt P — Residual Canvas Path Audit

-   **Objective:** Audit and port remaining Canvas-only paths.
-   **Scope:** Touch only modules identified in Prompt N’s checklist; produce audit report in docs and targeted ports in corresponding files.
-   **Constraints:** Communicate via TODO comments where hand-off needed; avoid touching fallback removal handled by Prompt Q.
-   **Deliverables:** Updated code with TODO removal list, tests for converted paths.

### Prompt Q — Feature Flag Removal & Fallback Hardening

-   **Objective:** Remove feature flags when appropriate, ensure fallback remains deterministic.
-   **Scope:** Modify config files, runtime toggles, fallback modules.
-   **Constraints:** Await completion of Prompt P tasks; rely on audit outputs.
-   **Deliverables:** Clean configuration, regression tests, documentation snippet in onboarding guide.

## Phase: Documentation Updates & AVP P4 Spec Prep

### Prompt R — Update WRMP Documentation After P4

-   **Objective:** Refresh renderer-contract.md and related files with Phase 4 outcomes.
-   **Scope:** Documentation only; ensure all references point to new default workflows.
-   **Constraints:** Leave AVP docs untouched.
-   **Deliverables:** Signed-off docs, updated release notes.

### Prompt S — Draft AVP P4 Specification

-   **Objective:** Author the Phase 4 spec in audio-visualisation-plan-3.md (relevant section) and supporting doc under docs.
-   **Scope:** Focus on spectrum/meter/oscilloscope enhancements leveraging WebGL features.
-   **Constraints:** Do not edit WRMP docs except for cross-links; coordinate with Prompt T for shared glossary references.

### Prompt T — Glossary & Docs Synchronization

-   **Objective:** Update glossary entries and cross-links for AVP Phase 4.
-   **Scope:** Modify audio-feature-bindings.md, add release-note snippets.
-   **Constraints:** Avoid overlapping spec edits from Prompt S; reference new terms only.

## Phase: AVP P4 Implementation

### Prompt U — Spectrum Enhancements

-   **Objective:** Implement spectrum visuals per Phase 4 spec.
-   **Scope:** Modify `src/components/visuals/spectrum/*`, associated shaders/materials, add tests.
-   **Constraints:** Avoid meter/oscilloscope modules; reuse shared materials defined in earlier prompts.

### Prompt V — Meter Enhancements

-   **Objective:** Implement volume meter upgrades.
-   **Scope:** Touch `src/components/visuals/meter/*`, add inspector controls, tests.
-   **Constraints:** No spectrum/oscilloscope changes.

### Prompt W — Oscilloscope Enhancements

-   **Objective:** Implement oscilloscope modes (stereo split, Lissajous, persistence).
-   **Scope:** Work in `src/components/visuals/oscilloscope/*`, add shader/material logic, tests.
-   **Constraints:** No edits to spectrum/meter modules.

### Prompt X — Shared Materials & History Utilities

-   **Objective:** Provide reusable material abstractions and history sampling utilities.
-   **Scope:** Update shared modules (`src/core/render/webgl/materials/*`, `src/utils/audio/history.ts`).
-   **Constraints:** Coordinate only via exported APIs; do not modify component-specific code.

### Prompt Y — Inspector & Documentation Updates

-   **Objective:** Add inspector controls, localization, and docs for new AVP features.
-   **Scope:** Update UI inspector files, localization bundles, documentation in docs.
-   **Constraints:** Avoid touching component logic files handled by Prompts U–W; only consume exported APIs.

_Each AVP prompt should run associated snapshot/unit tests for their modules and update documentation accordingly._

## Requirements Coverage

-   ✅ Provide parallel-safe prompts grouped per roadmap phase.
-   ✅ Minimize conceptual and merge conflicts through scoped instructions.
-   ✅ Reference attachments without rereading them, maintaining consistency with plans.

No quality gates executed—documentation-only output.

Happy to iterate if you want deeper sequencing for any single phase or automation-ready checklists.

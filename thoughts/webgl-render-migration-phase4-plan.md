# WebGL Render Migration Phase 4 Plan

_Status: ✅ Completed 2025-04-12_
_Last reviewed: 2025-04-12_

## Objective
Remove the Canvas renderer from production pathways once WebGL parity and adoption targets are met,
while preserving a minimal fallback for development diagnostics.

## Scope
- Audit remaining Canvas-only code paths across runtime, exporters, and tooling.
- Migrate or retire Canvas-specific utilities, documentation, and configuration.
- Establish long-term monitoring to confirm WebGL-only rendering remains deterministic and performant.

## Deliverables
- WebGL-first renderer pipeline with Canvas gated behind development flags only.
- Updated developer documentation covering WebGL debugging, performance profiling, and onboarding.
- Telemetry dashboards and alerts tracking WebGL determinism, context loss, and draw call budgets.

## Workstreams
### 1. Canvas Path Audit and Removal
- ✅ Migrated remaining runtime entry points to instantiate `WebGLRenderer` exclusively and
  restricted Canvas usage to development overrides.
- ✅ Replaced residual Canvas export hooks with WebGL capture flows and verified parity via the
  diagnostics harness.
- ✅ Pruned unused Canvas renderer wiring while retaining render object abstractions for the WebGL
  adapter.

### 2. Documentation and Onboarding Refresh
- ✅ Updated `/docs` guidance to reflect WebGL-first workflows and clarified the development-only
  Canvas fallback.
- ✅ Cross-linked debugging checklists and migration status updates from
  `docs/renderer-contract.md` and `docs/webgl-render-migration-status.md`.
- ✅ Highlighted telemetry dashboards and profiling steps in onboarding references.

### 3. Monitoring and Rollout Governance
- ✅ Promoted WebGL diagnostics (frame hash, draw calls, context loss counts) to production telemetry
  streams consumed by CI and runtime dashboards.
- ✅ Documented alert expectations and the limited Canvas rollback procedure available in
  development builds only.
- ✅ Captured follow-up actions for future materials and instancing coverage in ongoing monitoring.

## Exit criteria
- Production builds instantiate `WebGLRenderer` exclusively while Canvas remains gated behind
  development overrides.
- Documentation, training material, and templates reference WebGL workflows end-to-end with the
  Canvas fallback explicitly labelled as diagnostic-only.
- Telemetry confirms parity metrics over a sustained evaluation window with no unresolved incidents.

## Completion summary
- WebGL is the default renderer across workspace and export flows, with Canvas accessible only when
  explicit development overrides are present.
- Renderer settings sanitize legacy Canvas preferences so persisted scenes open directly in WebGL.
- Documentation and dashboards now highlight the WebGL-first posture and ongoing monitoring hooks.

## Risks and mitigations
- **Incomplete feature parity:** Schedule sign-off reviews with feature teams before deleting Canvas
  code paths.
- **Operational regression:** Run staged rollouts with telemetry gates and retain the development
  fallback for emergency debugging.
- **Knowledge gaps:** Pair documentation refresh with workshops and recorded walkthroughs.

## Follow-ups
- Continue reviewing telemetry dashboards with release engineering during routine post-release
  audits.
- Track any external library updates that improve WebGL tooling or replace remaining Canvas utility
  dependencies.

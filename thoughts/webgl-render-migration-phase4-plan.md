# WebGL Render Migration Phase 4 Plan

_Status: Draft – ready for execution_
_Last reviewed: 2025-04-05_

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
- Catalogue call sites invoking `ModularRenderer` and confirm WebGL coverage.
- Replace residual Canvas exports with WebGL capture flows or document exceptions.
- Delete unused Canvas render object implementations after confirmation from owning teams.

### 2. Documentation and Onboarding Refresh
- Update `/docs` guides to reference WebGL primitives exclusively (renderer contract, export flows,
  performance playbooks).
- Publish WebGL debugging checklists and profiler walkthroughs for internal tooling.
- Cross-link onboarding materials from `docs/renderer-contract.md` and the migration status summary.

### 3. Monitoring and Rollout Governance
- Promote WebGL diagnostics (frame hash, draw calls, context loss counts) to production telemetry.
- Define alert thresholds and escalation paths for determinism or performance regressions.
- Document rollback procedures leveraging the development-only Canvas fallback.

## Exit criteria
- Production builds instantiate `WebGLRenderer` exclusively; Canvas is disabled outside development
  environments.
- Documentation, training material, and templates reference WebGL workflows end-to-end.
- Telemetry confirms parity metrics over a sustained evaluation window with no unresolved incidents.

## Risks and mitigations
- **Incomplete feature parity:** Schedule sign-off reviews with feature teams before deleting Canvas
  code paths.
- **Operational regression:** Run staged rollouts with telemetry gates and retain the development
  fallback for emergency debugging.
- **Knowledge gaps:** Pair documentation refresh with workshops and recorded walkthroughs.

## Follow-ups
- Coordinate with the release engineering team to schedule the production cutover once exit criteria
  reports are green.
- File tracking issues for any Canvas dependencies that require external library updates.

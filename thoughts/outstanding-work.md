# Outstanding work

_Last reviewed: 2025-05-18_

## Audio visualisation
- **Phase 1 – Multi-feature analysis architecture:** extend bindings to accept descriptor arrays with
  optional channel aliases, persist `analysisProfileId` metadata, and update validation plus cache tooling
  for deterministic downsampling.
- **Phase 3.5 – WebGL renderer integration:** finalise the renderer contract for audio payloads, deliver a
  deterministic WebGL service with CPU fallback, and port spectrum, meter, and oscilloscope visuals with
  snapshot coverage.
- **Phase 4 – Element rendering enhancements:** add spectrum mappings, meter styling controls, and
  oscilloscope modes while ensuring localisation, performance budgets, and regression snapshots stay green.
- **Phase 5 – Global styling and export polish:** introduce workspace-wide styling hooks, oversampling and
  motion blur exports, and preset round-tripping backed by documentation updates.
- **Open questions:** confirm plans for track alias editing, cache telemetry granularity, descriptor cleanup
  behaviour, and long-term retention for `analysisIntentHistory`.

## WebGL polish
- **Phase C – Text rendering containment:** isolate Canvas 2D usage to glyph atlas preparation (prefer
  `OffscreenCanvas`), batch texture uploads, and add guards that prevent the preview canvas from acquiring
  a 2D context outside the text pipeline.
- **Phase D – Performance optimisation:** pursue RAF scheduling consolidation, typed-array arenas, VAO
  adoption, texture lifecycle telemetry, and shader warmup so frame pacing improves by ≥10% over the Phase B
  baseline.
- **Phase E – Rollout and validation:** expand QA matrices, enforce WebGL2-only regression coverage, wire
  diagnostics dashboards, and finalise rollout and rollback procedures.
- **Instrumentation follow-ups:** capture preview logs that exercise new diagnostics, expand regression
  fixtures and telemetry thresholds, refresh onboarding material, and evaluate `OffscreenCanvas` support for
  export offloading.

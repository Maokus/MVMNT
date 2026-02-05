# ESLint Rollout Plan

_Last updated: 2025-11-28_

## Snapshot of the Current State

-   `npm run lint` executes `tsc --noEmit`; ESLint is not part of the automated workflow.
-   The flat `eslint.config.ts` extends the base JS, TypeScript, and React recommended presets without repository-specific overrides.
-   Lint errors are not surfaced in CI; `npm run test` and `npm run build` both succeed even with style and correctness issues that ESLint would typically catch.
-   The codebase is large (React + TypeScript) with multiple feature folders (`animation/`, `audio/`, `export/`, etc.), so a full one-shot lint fix is impractical.

## Goals

1. Introduce ESLint as a first-class quality gate without disrupting ongoing feature work.
2. Drive the warning count to zero and keep it there.
3. Provide team-friendly tooling (editor integration + scripts + CI) so developers get fast feedback.
4. Avoid large, risky "big bang" refactors by shipping lint coverage in controlled slices.

## Guiding Principles

-   **Start non-blocking, end blocking.** First collect signal, then fail builds once the noise is removed.
-   **Prefer additive rules.** Begin with correctness and consistency rules that catch bugs, add stylistic rules only after buy-in.
-   **Make the cost visible.** Track lint error counts and show deltas in PRs/CI dashboards.
-   **Automate the guardrails.** Every new rule should have an associated autofix or documented resolution path.
-   **Measure success.** Each phase has an explicit exit criterion so we know when to move forward.

## Phase Plan

### Phase 0 — Foundation (week 0)

**Objectives**

-   Ensure ESLint is runnable locally and in CI.
-   Establish owner(s) and communication channels.

**Key Tasks**

-   Update `npm run lint` to run both `tsc --noEmit` and `eslint` (e.g., `npm run lint:types && npm run lint:eslint`).
-   Add a dedicated `lint:eslint` script: `eslint "src/**/*.{ts,tsx}" --max-warnings=0 --report-unused-disable-directives`.
-   Confirm editor integrations (VS Code ESLint extension) work with the flat config and TypeScript project references.
-   Publish a short announcement in `docs/` or #dev channel outlining the plan and expectations.

**Exit Criteria**

-   ESLint runs to completion locally, even if it exits with non-zero status.
-   Team is aware of the rollout plan and knows whom to contact for help.

### Phase 1 — Baseline Inventory (week 1)

**Objectives**

-   Capture the existing lint error landscape without breaking builds.
-   Prioritize rule fixes based on severity and frequency.

**Key Tasks**

-   Run `eslint . --format json` in CI and upload the report as an artifact (do not fail CI yet).
-   Produce a dashboard (spreadsheet or markdown) summarizing counts by rule, directory, and severity.
-   Tag rules into categories: **Blockers** (potential bugs), **Consistency**, **Style**.
-   Identify quick wins with autofix (`--fix`) and high-severity manual fixes.

**Exit Criteria**

-   Inventory document shared with maintainers.
-   Top 5 blocker rules prioritized with assignees.

### Phase 2 — High-Signal Rule Cleanup (weeks 2–4)

**Objectives**

-   Eliminate blocker-category violations across the codebase.
-   Keep Phase 1 inventory up to date as fixes land.

**Key Tasks**

-   Create tickets per rule + directory cluster (e.g., `no-undef` in `audio/*`).
-   Enable `eslint --max-warnings=0` for blocker rules only (use rule overrides or `eslint --rule "rule-name: 2"`).
-   Apply `eslint --fix` where possible, review manual fixes via PRs.
-   Build a `lint:changed` script (e.g., using `eslint --cache --cache-location node_modules/.cache/eslint`) for faster feedback on active branches.

**Exit Criteria**

-   All blocker rules have zero violations.
-   CI fails when a blocker rule regresses.

### Phase 3 — Incremental Directory Coverage (weeks 4–8)

**Objectives**

-   Turn on full linting for prioritized feature areas while buffering the rest.
-   Prevent regressions in the cleaned directories.

**Key Tasks**

-   Pick 1–2 feature folders per sprint (e.g., `components/`, `export/`).
-   For each folder:
    -   Run `eslint src/folder --fix`.
    -   For remaining issues, create focused fix PRs.
    -   Gate the folder in CI using overrides: `overrides: [{ files: ["src/folder/**"], rules: { ...fullRuleSet } }]`.
-   Update docs with the "linted folders" list and maintainers.

**Exit Criteria**

-   Documented list of lint-enforced directories covering ≥60% of frequently touched files.
-   CI fails on lint violations inside the cleaned directories.

### Phase 4 — Repository-Wide Enforcement (weeks 8–10)

**Objectives**

-   Enable the full lint rule set for the entire repo.
-   Integrate linting into PR and release workflows.

**Key Tasks**

-   Remove directory-specific overrides; apply the rule set globally.
-   Add ESLint to required CI checks (GitHub branch protection).
-   Configure pre-push or pre-commit hooks (`lint-staged` + `husky` or `simple-git-hooks`) to enforce lint on changed files.
-   Update `docs/ARCHITECTURE.md` or a dedicated `docs/tooling.md` with linting guidance and common fixes.

**Exit Criteria**

-   CI lint job is mandatory and green.
-   Local developer workflow (hooks + editor) provides consistent lint feedback.

### Phase 5 — Rule Hardening & Maintenance (ongoing)

**Objectives**

-   Continuously improve rule coverage and developer experience.

**Key Tasks**

-   Introduce additional rules (accessibility, import sorting, complexity) after team votes.
-   Automate dependency updates for eslint plugins with Renovate or Dependabot.
-   Schedule quarterly lint health checks (warning counts, lint duration, cache hit rate).
-   Document how to suppress or opt out of rules (with justification templates).

**Exit Criteria**

-   Warning count remains at zero.
-   Average lint run time < 30s on developer machines (tracked via telemetry or manual sampling).

## Supporting Workstreams

-   **Tooling:** Add an ESLint cache, integrate with IDE settings (`.vscode/settings.json`), and consider `eslint-plugin-import` for module hygiene.
-   **Training:** Run a short knowledge-share session or record a Loom walkthrough showing autofix workflows.
-   **Communication:** Maintain a running changelog in `docs/CHANGELOG.md` for newly enabled rules and their rationale.

## Risks & Mitigations

| Risk                                   | Impact                | Mitigation                                                                                  |
| -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| Large fix PRs cause merge conflicts    | Slows delivery        | Tackle high-churn directories first; use small, frequent PRs.                               |
| Performance regressions from lint runs | Developer frustration | Enable caching, scope to changed files in hooks, run full lint only in CI.                  |
| Lack of rule ownership                 | Stalled rollout       | Assign a lint champion per sprint to shepherd fixes and unblock contributors.               |
| Divergent editor configs               | Confusing results     | Publish recommended VS Code settings and align Prettier/ESLint formatting responsibilities. |

## Success Metrics Dashboard

Track these metrics in a spreadsheet or lightweight dashboard:

-   **Violations per rule** (target: trending to zero by Phase 4).
-   **Directories fully linted** (target: 100% by Phase 4 exit).
-   **CI lint duration** (target: < 2 minutes).
-   **Developer-reported lint friction** (target: < 10% negative responses in retro survey).

## Next Actions

1. Create tickets for Phase 0 tasks and assign owners.
2. Schedule a 30-minute kickoff to present the plan and gather feedback.
3. Begin Phase 0 immediately after kickoff.

# Import/Export Consistency Plan

## Status
Open for review

## Context
The codebase mixes CommonJS-inspired default exports with ES module named exports, and switches between path alias imports (e.g. `@export/...`) and relative paths within the same feature areas. The `src/AGENTS.md` guidelines prefer named exports and alias usage for intra-project modules, but multiple files currently diverge from that expectation.

Representative examples:
- `src/export/export-clock.ts` defines both a named `ExportClock` class and a default export of the same class, encouraging inconsistent import styles across consumers.【F:src/export/export-clock.ts†L6-L53】【F:src/export/export-clock.ts†L55-L56】
- Callers alternate between alias and relative imports for the same module: `video-exporter.ts` imports `ExportClock` via `@export/export-clock`, while `av-exporter.ts` and tests rely on `./export-clock` or `../export-clock` relative paths.【F:src/export/video-exporter.ts†L6-L9】【F:src/export/av-exporter.ts†L22-L24】【F:src/export/__tests__/video-export-timestamps.test.ts†L1-L18】
- Some utilities expose both aggregated named exports and a `default` alias (e.g., `noteQueryApi`), leading to ambiguity on the preferred import shape for new call sites.【F:src/core/timing/note-query.ts†L1-L99】【F:src/core/timing/note-query.ts†L160-L170】
- Within the note animation suite, import ordering and alias usage are inconsistent (`template.ts` mixes alias imports with locals in varying order, and `press.ts` keeps inline comments and unsorted alias references).【F:src/animation/note-animations/template.ts†L1-L31】【F:src/animation/note-animations/press.ts†L1-L38】

These inconsistencies complicate discoverability, hamper tree-shaking expectations, and raise onboarding questions around the “correct” pattern to follow.

## Goals
- Align every module with a single export convention (prefer named exports, no redundant default exports) to match project guidance.
- Establish deterministic rules for when to use path aliases vs relative paths (e.g., prefer aliases for cross-domain references, relative for same-folder siblings) and codify them.
- Normalize import grouping and ordering so that automated tools (lint/prettier) can enforce the conventions.
- Document the agreed patterns so future contributors adopt them without guesswork.

## Proposed Work Plan

### 1. Audit & Catalog Existing Patterns
- Build an inventory of modules that still expose default exports (either standalone or alongside named exports). Focus on `src/export`, `src/core/timing`, React entry points (`src/app`), and any utility directories with mixed styles.
- Flag files that import from the same module using both alias and relative paths to understand scope of refactors required.
- Capture import ordering deviations (third-party vs alias vs relative) to inform rule-set.
- Output a shared checklist (spreadsheet or doc) enumerating each module needing touch-up, so refactoring can progress in batches without regressions.

### 2. Define Source-of-Truth Conventions
- Draft concrete rules covering:
  - Export styles (e.g., “Only named exports; if a module provides a primary class/function, export it explicitly and re-export via index files as needed”).
  - When to introduce `index.ts` barrel files vs direct file imports.
  - Path selection hierarchy (e.g., “Use alias when crossing top-level feature boundaries; use relative for intra-folder imports to avoid circular alias paths”).
  - Import ordering/grouping (external packages → aliased modules → relative siblings) plus newline separation.
- Review the draft with maintainers to confirm compatibility with existing tooling (ESLint, Prettier, TypeScript path mapping).

### 3. Implement Incremental Refactors
- Update the highest-churn areas first (`src/export`, `src/core/timing`, `src/animation/note-animations`) to remove default exports and convert consumers to the new named patterns.
- Standardize imports in these areas according to the agreed hierarchy, leveraging TypeScript aliases to replace deep relative chains where appropriate.
- Introduce or adjust barrel files only where they reduce duplication without hiding module boundaries.
- Ensure tests compile under the new signatures, adjusting mocks/imports accordingly.

### 4. Automate Enforcement
- Add or update ESLint rules (e.g., `import/prefer-default-export`, `import/no-default-export`, `import/order`) reflecting the conventions, along with TypeScript ESLint config for path usage if feasible.
- Consider integrating lint-staged or a custom check to reject mixed alias/relative imports targeting the same module.
- Update Prettier or formatting hooks if needed to maintain spacing between import groups.

### 5. Document & Communicate
- Publish a concise guideline (linking from `/docs` or contributing guide) summarizing the conventions, including examples for complex cases (e.g., re-exporting types vs values).
- Announce the changes to the team, highlighting any developer workflow impacts (e.g., VS Code auto-import settings) and providing quick-fix instructions.
- Monitor new pull requests for adherence, refining rules or docs when recurring edge cases surface.

## Open Questions
- Should legacy entry points like `src/app/index.tsx` retain their default exports (React strict mode patterns) or be refactored, knowing that create-react-app templates expect defaults? Clarification will influence how aggressively we remove defaults in framework bootstrap files.【F:src/app/index.tsx†L1-L40】【F:src/app/reportWebVitals.ts†L1-L16】
- Do we want barrel files to aggregate subfeatures (e.g., entire `note-animations/` directory) or prefer explicit imports per animation to avoid bundling unused code?
- Are there build tooling constraints (Vite, mediabunny bundling) that rely on default exports in specific modules, which would require compatibility wrappers during migration?

## Next Steps
- Circulate this plan for feedback, resolve open questions, and then schedule implementation phases aligned with release cycles to minimize disruption.

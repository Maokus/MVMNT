# Refactor Execution Guide

Operational playbook for migrating to the target structure (see `TARGET_STRUCTURE.md`). No functional changes; path + filename relocations only.

## Goals

-   Clarify domain boundaries (`core`, `animation`, `ui`, etc.).
-   Normalize naming & prepare for future registry unification.
-   Maintain continuously green build.

## Safety Rules

1. One logical phase per commit (or few commits) – reversible.
2. Only change imports necessary for moved files; no opportunistic refactors.
3. After each phase run: type check, tests, dev load, build (fast path first two every time, build at least each major phase).
4. Prefer alias imports over brittle deep relatives post-move.

## Path Aliases (Add First)

Add to `tsconfig.json` (example snippet):

```jsonc
"paths": {
  "@app/*": ["app/*"],
  "@core/*": ["core/*"],
  "@animation/*": ["animation/*"],
  "@bindings/*": ["bindings/*"],
  "@export/*": ["export/*"],
  "@math/*": ["math/*"],
  "@ui/*": ["ui/*"],
  "@context/*": ["context/*"],
  "@hooks/*": ["hooks/*"],
  "@shared/*": ["shared/*"],
  "@utils/*": ["utils/*"],
  "@pages/*": ["pages/*"],
  "@assets/*": ["assets/*"]
}
```

Temporary (to be removed) legacy entries if needed early:

```jsonc
"@visualizer/*": ["visualizer/*"]
```

Remove in cleanup.

## Phase Overview

(See `MOVE_MAP.md` for granular order.)

1. Prep & Low-Risk: rename .js -> .ts, move math & animation seeds.
2. Core Extraction: split engine modules into `core`, `bindings`, `export`.
3. Scene Elements: relocate scene graph elements.
4. Note Animations: isolate under `animation/note-animations`.
5. UI Pages & Context: move top-level UI modules.
6. UI Layout & Panels: move complex UI clusters + input rows.
7. Shared & Assets: fonts & static assets.
8. App Bootstrap: move entry files into `app/`.
9. Cleanup: delete old dirs, finalize aliases, resolve stray types file.

## Command Pattern

Use `git mv` for each relocation:

```bash
git mv src/visualizer/timing-manager.js src/core/timing-manager.ts
```

Then fix imports inside the moved file only:

-   Replace old `from '../..../midi-manager'` with `from '@core/midi/midi-manager'`.

Automated search (optional):

```bash
rg "visualizer/" src || echo "No remaining visualizer paths"
```

## Verification Checklist (Per Phase)

-   Type check: `tsc --noEmit` clean.
-   Tests: `npm test -- --watch=false` all pass.
-   Dev server: app loads main view (smoke interactions: add element, start animation if possible).
-   Build (periodic): `npm run build` succeeds.

## Handling JS -> TS Conversion

-   Change extension only.
-   Add `// TODO: typify` for untyped params or large objects.
-   If using implicit `any` that breaks CI, explicitly annotate as `any` temporarily.

## Interaction File Placement Decision

Choose one: keep `interaction.ts` in `math/` (preferred for purity) OR promote to root `interaction.ts` if considered broader domain (update TARGET_STRUCTURE.md accordingly in PR). Do NOT keep duplicates.

## Fonts Service Move

Update imports like:

```ts
-import { loadFont } from '../utils/font-loader';
+import { loadFont } from '@shared/services/fonts/font-loader';
```

Perform a global search to confirm no stale paths.

## Cleanup Tasks

-   Remove `@visualizer/*` alias.
-   Delete `src/visualizer/` if empty.
-   Merge or remove `components/types.ts` (grep its exported symbols to confirm usage).
-   Optionally add ESLint rule restricting internal imports.

Example ESLint snippet:

```jsonc
"no-restricted-imports": ["error", { "patterns": ["visualizer/*", "../visualizer/*"] }]
```

## Post-Migration Hardening (Optional Enhancements)

1. Introduce `core/scene/registry/Registry.ts` generic and refactor existing registry usage.
2. Barrel hygiene: ensure `core/index.ts` exports only stable API.
3. Add tests: scene building, timing determinism, animation interpolation.
4. Document plugin guide (`PLUGINS.md`).
5. Add architectural guardrails to README / CONTRIBUTING.

## Rollback Strategy

If a phase introduces blocking errors:

```bash
git reset --hard <last-green-commit>
git checkout -b refactor/retry-phaseX
```

Split the failed phase into smaller chunks (e.g. move 5 files at a time).

## Commit Template

```
refactor(structure): move <fileA> to @core/<...>

Reason: part of Phase 2 core extraction.
No logic changes.
```

## Success Definition

-   All files reside in target directories.
-   All imports use new aliases (except intra-folder relatives).
-   No lingering references to `visualizer/` path.
-   Tests & build green.
-   Reviewers can diff to confirm only path/import changes.

---

Execute with discipline; resist additional refactors until structural consolidation is complete.

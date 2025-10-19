Here’s how you can split **`import-export-consistency-1.md`** into **parallelizable prompt batches** for maximum rollout speed.
Each prompt is self-contained — you can feed them to parallel Codex/AI instances or assign to contributors independently.

---

### 🧩 Phase 1 — Audit & Catalog

**Prompt 1: Audit Default Exports**

> Scan the codebase (especially `src/export`, `src/core/timing`, `src/app`, and utilities) for any file using a `default export`.
> Output a table listing:
>
> -   file path
> -   type of export (default, mixed, named only)
> -   whether consumers rely on default or named imports
> -   any unit tests using default imports
>     Reference goal: remove all default exports in favor of named ones.

---

**Prompt 2: Audit Path Alias vs Relative Imports**

> Identify all modules imported both by alias (e.g., `@export/...`) and relative paths (`../export-clock`).
> For each, output:
>
> -   file path
> -   inconsistent import locations
> -   suggested canonical form based on “use alias for cross-domain, relative for intra-folder”.

---

**Prompt 3: Audit Import Order Consistency**

> For every file in `src/animation/note-animations` and `src/core/timing`, list imports that break this order:
>
> 1. external dependencies
> 2. alias imports
> 3. relative imports
>    Separate groups with newlines.
>    Suggest corrected order per file.

---

### ⚙️ Phase 2 — Define Conventions

**Prompt 4: Write a Source-of-Truth Convention Draft**

> Write a 1-page concise ruleset covering:
>
> -   Export style: named exports only
> -   When to use barrel (`index.ts`) files
> -   Path alias hierarchy
> -   Import ordering and spacing rules
>     Keep it tool-friendly and compatible with ESLint/Prettier.

---

**Prompt 5: Verify Compatibility with Tooling**

> Check if ESLint, Prettier, and TypeScript path mappings already support the proposed rules from the draft.
> Suggest minimal config changes or plugin additions needed for enforcement.

---

### 🔧 Phase 3 — Implement Incremental Refactors

**Prompt 6: Refactor High-Churn Areas**

> Refactor all modules under `src/export`, `src/core/timing`, and `src/animation/note-animations` to use only named exports.
> Remove default exports, update all imports, and re-run type checks.
> Ensure test mocks and imports align with new names.

---

**Prompt 7: Standardize Import Paths**

> Replace deep relative imports with alias imports when crossing feature boundaries.
> Add/adjust barrel files where it reduces duplication without introducing ambiguity.
> Output a diff summary showing new alias paths and removed relative ones.

---

### 🧠 Phase 4 — Automate Enforcement

**Prompt 8: Add Lint Rules**

> Update ESLint config to include:
>
> -   `import/no-default-export`
> -   `import/order` grouping (external, alias, relative)
> -   custom rule rejecting mixed alias/relative imports of same module
>     Provide a working `.eslintrc` snippet.

---

**Prompt 9: Setup Pre-commit Enforcement**

> Configure `lint-staged` and Prettier hooks to automatically fix import order and reject default exports before commits.

---

### 📚 Phase 5 — Documentation & Rollout

**Prompt 10: Write Contributor Guide Update**

> Write a new `docs/import-style-guide.md` that summarizes:
>
> -   How to export/import correctly
> -   Common pitfalls
> -   Examples for complex re-exports (types, index barrels)
>     Keep under 300 words.

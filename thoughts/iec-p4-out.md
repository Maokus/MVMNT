# IEC Phase 4 Output: Frontend Module & Import Ruleset

**Status:** Decisions

## Export Style: Named Exports Only

-   Export every symbol explicitly by name from its defining file. Avoid `export default`, `module.exports`, and `export =` to keep re-exports predictable and align with static analysis tools.
-   Prefer `export const`, `export function`, `export class`, etc., at declaration time. Use `export { symbol }` blocks only when elevating existing declarations or re-exporting from modules inside barrels.
-   When a module defines a single primary entity, keep the filename aligned with the entity name (e.g., `Button.tsx` exporting `Button`). This preserves discoverability without relying on defaults.
-   Do not mix named and default exports in the same file. Refactor legacy defaults by renaming the file or symbol if necessary.

## Barrel (`index.ts`) File Usage

-   Create a barrel only when it reduces repetitive import paths across at least two call sites or when it defines the public surface for a package-level folder (e.g., `src/components/index.ts`).
-   Barrels should re-export named symbols from sibling modules; avoid defining new implementations within barrels.
-   Keep barrel content shallow: one directory level per barrel. Nested barrels must not create circular dependencies or re-export chains longer than two hops.
-   Document intentional barrels with a short header comment describing the folder contract (e.g., `// Components public API`). Remove barrels that accrue only a single export.
-   When re-exporting, preserve the original symbol names. Use `export { Foo } from "./Foo";` rather than renaming during re-export.

## Path Alias Hierarchy

-   Centralize alias definitions in `tsconfig.json` and mirror them in bundler config (`vite.config.ts`) to maintain parity between TypeScript and runtime resolution.
-   Relative paths (`./` and `../`) – for intra-folder collaboration only when the relationship is obvious.
-   Do not create aliases for leaf folders that are only consumed once; prefer local relative paths to avoid alias bloat.
-   When moving files, update both `tsconfig.json` and `vite.config.ts` together and run `npm run lint` to catch drift.

## Import Ordering & Spacing

-   Use a three-tier import order, inserting a blank line between tiers:
    1. **External packages** (npm modules, polyfills). Within this tier, sort alphabetically by module specifier; keep side-effect imports (e.g., `import "uno.css";`) at the top.
    2. **Path aliases** grouped by alias, sort alphabetically within each group.
    3. **Relative paths** starting from parent (`../`) before same-folder (`./`), with alphabetical ordering within each subset.
-   Destructure named imports alphabetically and keep the brace spacing consistent with Prettier (`import { Foo, Bar } from "...";` → becomes `import { Bar, Foo } from "...";` after formatting).
-   Limit each import statement to one module specifier. Avoid combined default + namespace imports per the named-export rule.
-   Place type-only imports (`import type { Props } from ...;`) after value imports from the same module, or consolidate via `import { type Props, Component } from ...;` to leverage TypeScript 4.5+ syntax.

## Tooling Alignment

-   Ensure Prettier handles spacing; do not disable formatting rules in comments unless absolutely necessary.

# Custom Font Support Research & Plan

**Status:** Draft

## Current Font Handling

-   **Font picker UX** – The editor uses `FontInput` for all `font` schema fields. It surfaces a curated list of Google/system fonts, optional Google Web Fonts API results, and stores selections as `Family|Weight` strings while caching recents in `localStorage`.【F:src/workspace/form/inputs/FontInput.tsx†L1-L372】【F:src/fonts/google-fonts-list.ts†L1-L57】
-   **Runtime loading path** – `ensureFontLoaded` and related helpers inject Google Fonts stylesheets, wait on the Font Loading API, and broadcast a `font-loaded` event when weights finish loading. The loader currently assumes remote Google fonts and tracks loaded weights per family.【F:src/fonts/font-loader.ts†L1-L119】
-   **Scene data model** – Text-capable scene elements persist the selected font string inside `fontFamily`, expecting the `Family|Weight` convention noted above.【F:src/core/types.ts†L300-L331】 Macros inherit the same storage shape when a property is bound to type `font`.【F:src/workspace/panels/properties/MacroConfig.tsx†L82-L195】【F:src/workspace/panels/properties/PropertyGroupPanel.tsx†L36-L109】
-   **Renderer integration** – Text-oriented scene elements (e.g., Text Overlay, Time Display, Time Unit Piano Roll) parse the stored string, call `ensureFontLoaded`, and build canvas fonts using the parsed weight plus a sans-serif fallback.【F:src/core/scene/elements/text-overlay.ts†L1-L84】【F:src/core/scene/elements/time-display.ts†L92-L199】【F:src/core/scene/elements/time-unit-piano-roll/time-unit-piano-roll.ts†L640-L719】
-   **Visualizer lifecycle** – Both the main render loop and context listen for the `font-loaded` event to invalidate the canvas, ensuring text measurements update after asynchronous font loads.【F:src/context/VisualizerContext.tsx†L180-L186】【F:src/context/visualizer/useRenderLoop.ts†L200-L220】
-   **Current gaps** – There is no pathway for registering non-Google font sources, persisting binary font assets, or presenting upload/management affordances beyond the curated list.

## Goals

1. Allow creators to upload or link custom fonts (TTF/OTF/WOFF2) alongside existing Google/system options.
2. Persist custom font assets per scene so they survive reloads, sharing, and export workflows.
3. Guarantee consistent rendering by preloading custom fonts wherever the canvas or exporters draw text.
4. Provide intuitive UI for discovering, previewing, managing, and reusing custom fonts without confusing developers or users about storage format.

## Decisions

-   Maintain the `Family|Weight` serialized value for backwards compatibility, but extend it to reference custom font variants via a scoped namespace (e.g., `Custom:<id>|700`) to avoid breaking existing bindings.
-   Treat uploaded fonts as scene-scoped assets so exports can embed them without external dependencies.

## Proposed Architecture

### 1. Font asset model & persistence

-   Introduce a `FontAsset` record in `@state/scene` (id, family name, available weights/styles, source blob hash, original filename, scope). Persist metadata in scene JSON and store binaries in a new `assets/fonts/` channel within scene packages similar to audio/midi payloads.【F:src/persistence/scene-package.ts†L1-L105】
-   Back the runtime store with IndexedDB (for browser sessions) and fall back to in-memory storage when unavailable. Reuse existing asset gateway patterns (`document-gateway.ts`) to abstract read/write so developers know where to plug in new storage backends.
-   Extend import/export routines to hydrate/dehydrate `FontAsset` payloads and update macros or bindings that reference them.

### 2. Loader extensions

-   Add `registerCustomFont({ id, family, weight, style, data })` to `@fonts/font-loader` that creates a `FontFace`, loads it, and records the variant inside `loadedFamilies` alongside Google weights so downstream `ensureFontLoaded` can resolve regardless of source.【F:src/fonts/font-loader.ts†L1-L119】
-   Emit the existing `font-loaded` event after custom faces finish loading, ensuring the visualizer invalidates consistently without new listeners.【F:src/context/VisualizerContext.tsx†L180-L186】
-   Provide a `resolveFontSource(fontFamily: string)` helper that parses `Custom:<id>` tokens and returns metadata needed by `ensureFontLoaded` so element code can stay simple.【F:src/core/scene/elements/text-overlay.ts†L64-L84】

### 3. UI integration

-   Update `FontInput` with a tabbed or segmented control for **Browse**, **Uploaded**, and **Manage**. The uploaded tab lists scene `FontAsset`s with family name, variant chips, and delete buttons. Selection should continue to emit `Family|Weight` (or `Custom:<id>|Weight`).【F:src/workspace/form/inputs/FontInput.tsx†L1-L372】
-   Add an inline upload button that opens a file picker restricted to common font MIME types. After upload, parse metadata (leveraging `FontFace` or a lightweight OpenType parser) to populate available weights before saving the asset.
-   Surface loading/error states (progress indicator while font registers, validation errors for unsupported formats, warnings when a weight is missing but requested).
-   Introduce a lightweight management dialog in project settings so users can rename or remove fonts without hunting for individual properties.

### 4. Runtime/editor wiring

-   When a font property references a custom asset, ensure `ensureFontLoaded` requests the custom variant before drawing. For Google/system fonts, keep existing behavior.【F:src/core/scene/elements/time-display.ts†L92-L199】
-   On scene load, eagerly register all custom fonts to reduce flicker when properties first render. Defer heavy weights until referenced to avoid unnecessary downloads.
-   Extend macro serialization so assigning a custom font macro carries the new token, and update macro import/export accordingly.【F:src/workspace/panels/properties/MacroConfig.tsx†L82-L195】

### 5. Export & rendering

-   Bundle font binaries inside export archives (`assets/fonts/<id>`). Update exporters to preload these blobs before rendering frames so offline exports match the editor view.【F:src/persistence/scene-package.ts†L1-L105】
-   Document how command-line or headless renderers should supply the same asset registry to avoid regressions in automated pipelines.

### 6. Quality gates

-   Add Vitest coverage for the new loader functions (e.g., verifying `registerCustomFont` populates `loadedFamilies` and triggers `font-loaded`).
-   Create integration tests that load a scene with a custom font and assert text measurement or style properties to guard against regressions in rendering paths.【F:src/context/visualizer/useRenderLoop.ts†L200-L220】

## UI/UX Considerations

-   Preserve quick access to popular Google fonts while clearly labeling uploaded assets so users understand provenance.
-   Provide live previews in the picker using the actual loaded font (fallback to system font with warning if load fails).【F:src/workspace/form/inputs/FontInput.tsx†L218-L371】
-   Communicate storage impact and licensing reminders in the management view to reduce confusion about redistribution.
-   Respect reduced-motion/accessibility settings in animations for loading indicators reused in the picker.

## Developer Experience Mitigations

-   Document the `Custom:<id>` convention and helper usage in `/docs` so contributors avoid hard-coding string parsing logic.【F:src/core/types.ts†L300-L331】
-   Provide TypeScript types (`FontSelection`, `FontAsset`) and utility functions to centralize parsing/formatting instead of duplicating string manipulation across elements.【F:src/fonts/font-loader.ts†L113-L118】
-   Update storybook/dev harnesses (if available) with sample custom fonts so developers can manually verify UI without digging into export packages.
-   Add inline comments around key integration points (loader, scene import/export) clarifying lifecycle to prevent mistaken assumptions about when fonts are ready.

## Open Questions

-   Do we need a global cache/shared library of uploaded fonts across scenes, or is scene-level scope sufficient?
-   How should we handle italic/variable font axes that do not map cleanly to numeric weights?
-   What file-size limits keep exports manageable without surprising users uploading large font families?
-   Are there licensing prompts we must display before bundling fonts into exports for distribution?

## Next Steps

1. Prototype `registerCustomFont` with an in-memory blob and verify it renders in the canvas preview alongside existing Google fonts.
2. Draft storage schema changes (state + persistence) and validate export/import round-trips with mock data.
3. Produce UI mocks for the enhanced font picker and management dialog, then implement feature-flagged components for iterative testing.
4. Write developer docs describing the new workflow and migration guidance for scenes that continue using legacy `Family|Weight` strings.

## Open questions answers

-   scene level scope is sufficient
-   research industry approaches to this problem and propose a solution

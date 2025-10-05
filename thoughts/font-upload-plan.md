# Custom Font Support Implementation Plan

**Status:** Ready for implementation

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
-   Treat uploaded fonts as scene-scoped assets so exports can embed them without external dependencies. Scene-level scoping keeps export bundles predictable and matches how Figma, Canva, and DaVinci Resolve isolate uploaded fonts per project.
-   Support italic and variable fonts by storing style axis metadata per variant. Each variant persists `{ weight, style, variationSettings? }` so we can map standard numeric weights, a boolean italic flag, and an optional dictionary of OpenType axis values. Renderer paths will treat `style: "italic"` as the signal to request an italic `FontFace`, while variable fonts can pass through `FontFace` construction via `variationSettings` without exploding the `Family|Weight` token space.
-   Enforce a 10 MB per-file upload limit (aligned with Canva’s and Adobe Express’ guidance) to keep scene archives lightweight; larger files are rejected with guidance to subset the font. Total scene font storage caps at 40 MB to preserve export/download ergonomics.
-   Present a lightweight licensing acknowledgement before the first upload in each session so users confirm they have the right to redistribute the font. Persist the acknowledgement per workspace in IndexedDB/localStorage and resurface links to licensing docs inside the management view.

## Implementation Breakdown

### Phase 0 – Research synthesis & kick-off

-   ✅ Confirmed scope: scene-level storage is sufficient; global libraries can be revisited if sharing workflows surface later.
-   ✅ Competitive scan: Figma/Canva gate uploads behind licensing acknowledgements, enforce per-file limits (~10 MB), and treat italic/variable axes as variant metadata rather than exploding font pickers.
-   Draft engineering brief linking to this plan and `/docs/architecture/scene-assets.md` once updated to include font storage rules.

### Phase 1 – Data model & persistence plumbing

1. Define TypeScript types inside `src/state/scene/fonts.ts`:
    - `FontAsset` with `id`, `family`, `variants`, `fileSize`, `originalFileName`, `createdAt`, `updatedAt`, and `licensingAcknowledged`.
    - `FontVariant` describing `{ weight, style, variationSettings?, postscriptName?, sourceFormat }`.
    - `FontSelection` union representing Google/system tokens and `Custom:<id>|<weight>|<style?>` (serialized as `Custom:<id>|<weight>[i]`).
2. Extend scene schema (`src/core/types.ts`) to include `fontAssets: Record<id, FontAsset>` and migrate persistence fixtures.
3. Update `src/state/scene/sceneSlice.ts` reducers/selectors to support CRUD operations on `FontAsset`s (create, rename, delete, variant rename) with optimistic updates and undo history integration.
4. Introduce `assets/fonts/` handling in `src/persistence/scene-package.ts` and `src/persistence/document-gateway.ts`:
    - Serialize binaries via the existing `AssetWriter` pattern.
    - On import, hydrate metadata then enqueue registration with the loader.
5. Write migration script ensuring legacy scenes without `fontAssets` receive an empty object and legacy `fontFamily` strings remain untouched.

### Phase 2 – Client-side storage & loader enhancements

1. Add an IndexedDB-backed `FontBinaryStore` (new module under `src/persistence/font-binary-store.ts`) that mirrors the audio asset pattern. Provide methods `put(id, arrayBuffer)`, `get(id)`, `delete(id)`.
2. Extend `src/fonts/font-loader.ts`:
    - Add `registerCustomFontVariant({ asset, variant, data })` that creates a `FontFace`, applies `style`/`variationSettings`, loads it, and updates `loadedFamilies` map using compound keys (`Custom:<id>` -> variant map).
    - Introduce `ensureFontVariantsRegistered(assetId: string, variants: FontVariant[])` to bulk-load when scenes initialize.
    - Update `ensureFontLoaded` to call `resolveFontSource` which now differentiates Google/system/custom flows.
3. Broadcast `font-loaded` events and integrate with the existing render loop invalidation. Ensure failure paths emit a `font-load-error` custom event consumed by UI toast notifications.
4. Cache successful loads in IndexedDB using `FontFaceSet.load()` plus `FontFace` descriptors for offline replay across sessions.

### Phase 3 – Upload pipeline & validation

1. Build `parseFontMetadata(file: File)` utility using `@opentypejs/opentype.js` (already transpilable) to read family name, PostScript names, supported weights/styles, variation axes, and file size.
2. Implement validation rules:
    - MIME whitelist: `font/ttf`, `font/otf`, `font/woff`, `font/woff2`.
    - File size: reject >10 MB with UI guidance to subset or compress.
    - Duplicate detection: compare SHA-256 digest before upload; surface dedupe message linking to existing asset.
3. Persist first-run licensing acknowledgement in `localStorage.fontUploadAcknowledged = true`; block uploads until the user confirms.
4. After successful upload, stream file into `FontBinaryStore`, create `FontAsset`, kick off `registerCustomFontVariant` for preview variant, and show toast when ready.

### Phase 4 – UI/UX integration

1. Enhance `FontInput`:
    - Add segmented control (**Library**, **Uploaded**, **Manage**).
    - In **Library**, maintain existing Google/system search with lazy load; highlight when a custom selection is active.
    - In **Uploaded**, display cards per family with variant chips (weight/style). Selecting a chip emits `Custom:<id>|<weight>[i]` tokens.
    - Inline upload button triggers licensing modal (if needed) then file picker; show progress and success states.
2. Build `FontManagerDialog` under `src/workspace/panels/assets/FontManagerDialog.tsx`:
    - List all scene fonts with rename/delete actions and storage usage meter.
    - Show licensing reminder + link to docs.
    - Provide “Replace file” option that retains IDs while re-uploading binary (for bug fixes).
3. Update property panels and macro configuration to render `FontChip` component for consistent visualization of custom fonts.
4. Introduce global toast notifications and inline field warnings when referenced variant is missing; offer fallback to closest weight.

### Phase 5 – Runtime/editor integration

1. On scene load (`src/state/document/actions.ts`), eagerly fetch all font binaries into memory and invoke `ensureFontVariantsRegistered` for their default variants.
2. Update renderers (`src/core/scene/elements/*`) to request italic variants when `FontSelection` encodes `[i]` suffix; fallback to `style: normal` while surfacing telemetry event.
3. Extend macro serialization/deserialization to preserve the full token; update macro UI to prevent selecting weights the asset does not supply.
4. Ensure exporters (`scripts/export` or equivalent) load custom fonts before rendering frames by wiring into the shared loader utilities.

### Phase 6 – Export, sharing, and headless support

1. Scene package export:
    - Include binaries under `assets/fonts/<id>/<filename>`.
    - Update manifest to track file size + checksum for integrity validation on import.
2. Browser download/export flows: ensure `Blob` creation uses `application/zip` bundling; warn when total font payload >40 MB.
3. CLI/headless renderers: update documentation and configuration to accept `--font-dir` parameter pointing to extracted assets.
4. Add regression test that opens exported archive, verifies fonts exist, and that re-import yields identical `FontAsset` metadata.

### Phase 7 – Quality gates & telemetry

1. Unit tests:
    - Loader tests verifying `registerCustomFontVariant` updates caches and emits events.
    - Persistence tests ensuring `FontAsset` metadata survives round-trips.
    - Validation tests covering MIME/size/licensing flows.
2. Integration/e2e tests (Playwright or Cypress) simulating upload, selection, deletion, and export.
3. Telemetry:
    - Add analytics events (`font_upload_started/succeeded/failed`, `font_variant_missing_fallback_used`).
    - Track aggregate storage usage per scene for future quotas.

### Phase 8 – Documentation & rollout

1. Update `/docs/user-guide/fonts.md` with upload instructions, limits, licensing reminders, and troubleshooting.
2. Expand `/docs/architecture/scene-assets.md` with schema diagrams and loader lifecycle.
3. Record release notes entry in `docs/changelog.md` under “Added”.
4. Feature flag initial rollout behind `enableCustomFonts`; add setting to Labs panel for internal dogfooding.
5. Plan staged rollout: alpha (internal), beta (select creators), GA (all) after telemetry indicates stability.

## UI/UX Considerations

-   Preserve quick access to popular Google fonts while clearly labeling uploaded assets so users understand provenance.
-   Provide live previews in the picker using the actual loaded font (fallback to system font with warning if load fails).【F:src/workspace/form/inputs/FontInput.tsx†L218-L371】
-   Communicate storage impact, licensing reminders, and size limits in both upload dialog and management view.
-   Respect reduced-motion/accessibility settings in animations for loading indicators reused in the picker.
-   Offer quick links to recommended tooling (e.g., Glyphs/Transfonter) for subsetting fonts that exceed size limits.

## Developer Experience Mitigations

-   Document the `Custom:<id>` convention and helper usage in `/docs` so contributors avoid hard-coding string parsing logic.【F:src/core/types.ts†L300-L331】
-   Provide TypeScript types (`FontSelection`, `FontAsset`) and utility functions to centralize parsing/formatting instead of duplicating string manipulation across elements.【F:src/fonts/font-loader.ts†L113-L118】
-   Update storybook/dev harnesses (if available) with sample custom fonts so developers can manually verify UI without digging into export packages.
-   Add inline comments around key integration points (loader, scene import/export) clarifying lifecycle to prevent mistaken assumptions about when fonts are ready.
-   Create VS Code snippets or ESLint rules to discourage manual string parsing of `fontFamily` tokens.

## Timeline & dependencies

| Phase | Duration | Dependencies |
| --- | --- | --- |
| 0 | 0.5 week | Design/product review |
| 1 | 1.5 weeks | Schema + persistence alignment |
| 2 | 1 week | Phase 1 types |
| 3 | 1 week | Phase 2 loader | 
| 4 | 1.5 weeks | Phases 1–3 | 
| 5 | 1 week | Phases 1–4 |
| 6 | 1 week | Phases 1–5 |
| 7 | 1 week | Loader & persistence stable |
| 8 | 0.5 week | QA sign-off |

## Risks & mitigations

-   **Large font uploads slow exports** – Enforce limits, display usage meters, and recommend subsetting.
-   **Variable font axis mismatch** – Persist axis metadata and clamp unsupported axes to defaults; log warnings to telemetry for follow-up.
-   **Loader regressions** – Maintain comprehensive unit tests and guard behind feature flag until confidence grows.
-   **Licensing liability** – Require acknowledgement and link to policy docs; allow admins to disable uploads globally if needed.

## Next Steps

1. Finalize UI requirements with design, including mock approvals and feature flag plan.
2. Create engineering tickets per phase with acceptance criteria referencing this document.
3. Set up a shared sample scene containing Google + custom fonts for regression testing.


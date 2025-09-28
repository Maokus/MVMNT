# Plan: Default Scene Loading & Metadata Editing

## Overview
- Replace legacy scene template helpers with logic that imports the default `.mvt` template.
- Introduce shared helpers/state so both workspace and easy mode open the default template on first load.
- Extend settings modal to expose scene metadata fields backed by a dedicated store. Ensure exports/imports preserve the new metadata state.

## Steps
1. **Default template loader**
   - Create a helper module (e.g., `src/core/default-scene-loader.ts`) that parses `src/templates/default.mvt` and exposes functions to import it via `importScene`/`DocumentGateway`.
   - Provide async `loadDefaultScene` and `getDefaultSceneSettings` helpers, and ensure timeline/metadata stores hydrate from template metadata.

2. **State updates for metadata**
   - Add a new Zustand store (e.g., `useSceneMetadataStore`) holding `id`, `name`, `description`, timestamps, and actions for updates/hydration.
   - Synchronize metadata updates with the timeline store (ids/names) and expose utilities for `modifiedAt` timestamps.
   - Update `DocumentGateway`, export/import flows, and reset helpers to read/write metadata through the new store.

3. **Refactor scene initialization**
   - Replace `createDefaultMIDIScene` usages in workspace/easy mode/visualizer core/menu bar with the new loader.
   - Ensure async pathways await the loader and refresh UI/timeline as needed; fallback logic for debug templates should remain intact.
   - Remove redundant exports of `createDefaultMIDIScene` from `scene-templates` and minimize references to that module.

4. **Settings modal metadata UI**
   - Inject the new store into `SceneSettingsModal` and add form controls for scene ID, name, description, and timestamps (read-only for created/modified if appropriate).
   - Wire inputs to store actions, update `SceneContext` to derive scene name from metadata, and keep the existing export/debug controls intact.

5. **Polish & tests**
   - Adjust unit tests or add new coverage if loaders/store logic requires it (e.g., ensure metadata hydrates on import).
   - Run `npm run test`, `npm run build`, and `npm run lint` before finalizing.

## Open Questions
- Confirm whether created/modified timestamps should be editable or derived automatically.
- Validate that template/debug loaders still behave when metadata is missing.

# src/workspace Directory

## Overview

The `src/workspace` directory contains the main UI components and panels for the MVMNT application workspace. This is where users interact with the visual editor, timeline, properties, and scene elements. The workspace provides a comprehensive interface for creating and editing MIDI-driven motion graphics.

## Directory Structure

```
src/workspace/
├── components/        # Reusable workspace-specific UI components
├── dev/              # Developer tools and diagnostic overlays
├── form/             # Form inputs and controls
├── layout/           # Main layout components and modals
├── panels/           # Primary workspace panels (timeline, properties, preview, scene elements)
└── templates/        # Template system for quick project setup
```

## Domain Organization

### components/

Shared, reusable UI components used throughout the workspace:

-   **AudioWaveform.tsx** – Lightweight canvas-based waveform renderer that displays audio peak data from the audio cache. Supports region trimming and visible window parameters. Subscribes to timeline store for real-time updates.
-   **CacheDiagnosticsPopup.tsx** – Pop-up notification that alerts users when audio analysis features are required but not yet calculated. Provides actions to calculate missing feature tracks or dismiss the warning.
-   **MidiNotePreview.tsx** – Visual preview component that renders MIDI notes as colored bars in a compact view. Used in timeline track rows to show note patterns at a glance. Handles pitch range normalization and velocity-based opacity.

### dev/

Developer-focused utilities for debugging and diagnostics:

-   **DeveloperOverlay.tsx** – Main development overlay (toggleable with `?` key) that aggregates telemetry, transport state, audio diagnostics, and undo history. Only visible in non-production builds or when explicitly enabled via `window.__mvmntDebugSettings`.
-   **developerOverlay/** – Modular sections for the overlay:
    -   **AudioDiagnosticsSection.tsx** – Displays audio cache status, feature track availability, and analysis queue state
    -   **TelemetrySection.tsx** – Shows command execution metrics (count, duration, errors) for scene and timeline stores
    -   **TransportSection.tsx** – Real-time transport coordinator state (mode, tick, playback status)
    -   **UndoSection.tsx** – Undo/redo stack visualization with history size and state inspection
    -   **Section.tsx** – Collapsible section wrapper component used by all overlay sections

### form/

Form inputs and specialized controls for element configuration:

-   **inputs/** – Collection of custom input components:
    -   **FormInput.tsx** – Generic form input dispatcher that routes to specialized components based on schema type. Handles number dragging, text inputs, color pickers, file uploads, and custom selectors. Provides merge session support for smooth real-time updates.
    -   **FileInput.tsx** – File upload control for loading assets
    -   **FontInput.tsx** – Font family selector with web-safe and Google Fonts support
    -   **AudioAnalysisProfileSelect.tsx** – Dropdown for selecting audio analysis profiles (spectrogram, onset detection, etc.)
    -   **TimelineTrackSelect.tsx** – Dropdown for selecting timeline tracks (audio or MIDI) used for data binding
    -   **ColorInput.tsx** – Color picker for RGB values
    -   **ColorAlphaInput.tsx** – Color picker with alpha channel support
    -   **useNumberDrag.ts** – Custom hook that enables click-and-drag interactions on number inputs. Supports step increments, min/max bounds, and merge sessions for smooth undo/redo grouping.

### layout/

Top-level layout components, modals, and overlays:

-   **MenuBar.tsx** – Application header with logo, scene name editor, save/load/clear actions, template browser integration, and settings modal. Includes scene menu dropdown and help trigger.
-   **SidePanels.tsx** – Container for workspace panels with dynamic vertical/horizontal layout based on viewport size. Handles resizable splits between scene elements and properties panels. Integrates element dropdown for adding new scene elements.
-   **RenderModal.tsx** – Export configuration dialog for video and image sequence rendering. Provides controls for format (video/PNG), container (MP4/WebM), codec selection, bitrate, FPS, audio settings, and duration trimming. Includes real-time file size estimation.
-   **SaveSceneModal.tsx** – Dialog for saving current scene to `.mvt` format
-   **SceneSettingsModal.tsx** – Global scene configuration (canvas size, background, etc.)
-   **SceneAnalysisCachesTab.tsx** – Interface for managing audio analysis caches and feature tracks
-   **SceneFontManager.tsx** – Font loading and management component that handles web font imports
-   **MidiVisualizer.tsx** – Dedicated MIDI visualization component for real-time preview
-   **OnboardingOverlay.tsx** – First-time user onboarding flow with tutorial steps
-   **ExportProgressOverlay.tsx** – Full-screen overlay showing export progress, frame count, and estimated time remaining
-   **SmallScreenWarning.tsx** – Warning message displayed on viewports below minimum width

### panels/

Core workspace panels that make up the main editing interface:

#### preview/

-   **PreviewPanel.tsx** – Main canvas preview panel that displays the rendered scene. Handles canvas sizing to maintain aspect ratio, mouse interaction for element selection and manipulation, and real-time rendering updates.
-   **canvasInteractionUtils.ts** – Utilities for canvas interaction (click, drag, transform). Converts mouse coordinates to canvas space, performs hit testing on elements, and dispatches element updates.

#### properties/

-   **PropertiesPanel.tsx** – Container that switches between element properties and global properties based on selection state
-   **ElementPropertiesPanel.tsx** – Displays and edits properties for the currently selected scene element. Dynamically generates form controls based on element schema.
-   **GlobalPropertiesPanel.tsx** – Shows global scene settings, export controls, and debug settings when no element is selected
-   **PropertyGroupPanel.tsx** – Collapsible group wrapper for organizing related properties into sections
-   **MacroConfig.tsx** – UI for configuring macro bindings on element properties

#### scene-element/

-   **SceneElementPanel.tsx** – Main panel for managing scene elements in the project
-   **ElementList.tsx** – Drag-and-drop sortable list of scene elements with z-order management. Handles reordering via drag gestures and visual drop indicators.
-   **ElementListItem.tsx** – Individual element row with visibility toggle, selection highlight, duplicate/delete actions, and editable ID field
-   **ElementDropdown.tsx** – Dropdown menu for adding new scene elements by type (shapes, text, piano roll, audio-reactive elements)

#### timeline/

-   **TimelinePanel.tsx** – Main timeline panel that integrates ruler, track list, and track lanes. Handles MIDI/audio file imports, multi-track decision prompts, scroll synchronization, and zoom controls.
-   **TrackEditorRow.tsx** – Individual track row in the timeline with waveform/note preview, trim handles, offset controls, and track-specific actions
-   **TrackList.tsx** – Sidebar list of track labels with selection and visibility controls
-   **TrackLanes.tsx** – Canvas-based rendering of track content in the timeline grid
-   **TimelineRuler.tsx** – Time ruler with tick marks, beat/bar labels, and playhead indicator
-   **MidiImportModeModal.tsx** – Dialog that prompts user to choose between single-track or multi-track import when loading MIDI files with multiple tracks
-   **useTickScale.ts** – Custom hook for calculating pixel-to-tick scaling based on zoom level and viewport size

#### TransportControls.tsx

Simple play/pause/stop controls for timeline playback. Used in the main header for quick access.

### templates/

Template system for pre-built scene configurations:

-   **types.ts** – TypeScript interfaces for template definitions and metadata
-   **easyModeTemplates.ts** – Dynamic importer that loads `.mvt` template files from the `/templates` directory. Uses Vite's glob import feature to lazy-load templates and extract metadata.
-   **BrowseTemplatesButton.tsx** – Button that opens template browser modal
-   **TemplateBrowserModal.tsx** – Modal for browsing and applying templates with preview thumbnails and descriptions
-   **useTemplateApply.ts** – Custom hook for applying templates to current scene. Handles artifact loading, scene import, metadata restoration, undo reset, and UI refresh.

## Key Architectural Patterns

### Store-First Architecture

Components in this directory consume state from Zustand stores via selectors and dispatch commands through gateways:

-   **timelineStore** – Timeline tracks, transport state, playback range, zoom/view parameters
-   **sceneStore** – Scene elements, configurations, macros, bindings
-   **useScene** context hook – High-level scene operations (save, load, clear)
-   **useSceneSelection** context hook – Element selection state and manipulation
-   **useVisualizer** context hook – Rendering context, export settings, canvas reference

### Command Gateway Pattern

State mutations flow through command gateways (`dispatchSceneCommand`, `dispatchTimelineCommand`) that:

-   Validate inputs
-   Apply store mutations
-   Track undo/redo history
-   Emit telemetry events for diagnostics
-   Support merge sessions for grouping rapid updates

### Real-Time Synchronization

-   Canvas rendering updates are driven by store subscriptions and React's useEffect
-   Timeline waveforms and note previews refresh when cache data changes
-   Transport coordinator broadcasts tick updates for synchronized playback
-   Developer overlay subscribes to command events for live telemetry

### Merge Sessions

Number drag interactions and other rapid updates use merge sessions to group consecutive mutations into single undo/redo entries. Each session has a unique ID and a finalize flag that signals when the interaction is complete.

## Data Flow

1. **User Input** → UI component receives interaction (click, drag, text input)
2. **Local State** → Component may maintain temporary state for smooth UX (e.g., dragging, typing)
3. **Command Dispatch** → On commit, component dispatches command through gateway with merge session metadata
4. **Store Update** → Gateway validates and applies mutation to Zustand store
5. **Selector Re-evaluation** → Memoized selectors recompute derived data
6. **Re-render** → Components re-render with updated store values
7. **Runtime Sync** → Visualizer runtime adapters observe store changes and invalidate cached objects

## Common Integration Points

### Adding a New Scene Element

1. Define element class in `src/core/scene/elements/`
2. Register in element factory
3. Update `ElementDropdown.tsx` to include new type in menu
4. Define schema for properties in element definition
5. `ElementPropertiesPanel.tsx` will auto-generate form controls from schema

### Adding a New Form Input Type

1. Create input component in `form/inputs/`
2. Update `FormInput.tsx` type dispatcher to handle new type
3. Schema should specify `type` field matching your new input
4. Component receives `value`, `onChange`, and `schema` props

### Adding a New Template

1. Place `.mvt` file in `/templates` directory at project root
2. Add entry to `/templates/manifest.ts` with name, description, and author
3. Template will auto-load via Vite glob import in `easyModeTemplates.ts`

### Adding Developer Overlay Section

1. Create section component in `dev/developerOverlay/`
2. Use `Section.tsx` wrapper for consistent styling and collapse behavior
3. Import and integrate in `DeveloperOverlay.tsx` main component
4. Add toggle state to `sectionsOpen` object

## Testing Considerations

-   Components assume store initialization – tests should mock Zustand stores
-   Timeline components depend on timing utilities and transport coordinator
-   Canvas interactions require mocked canvas context and bounding client rect
-   File upload components should mock `FileReader` and file input events
-   Export/render components depend on `mediabunny` library – use dynamic imports with fallbacks

## Performance Notes

-   **AudioWaveform** renders on `<canvas>` to avoid DOM overhead for long tracks
-   **TrackLanes** uses single canvas for all timeline track content to minimize repaints
-   **ElementList** uses drag state in refs to avoid re-renders during drag operations
-   **Number drag** interactions throttle onChange calls and use merge sessions to batch undo entries
-   **Selector memoization** is critical – components should use specific selectors rather than subscribing to entire store

## Future Considerations

-   Migrate remaining class-based components to functional components with hooks
-   Consolidate modal management into single modal provider/context
-   Extract common layout patterns (resizable panels) into shared utilities
-   Add comprehensive integration tests for command flow and undo/redo
-   Consider virtualizing timeline track list for projects with 100+ tracks

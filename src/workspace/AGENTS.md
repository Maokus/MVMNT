# src/workspace Directory

## Overview

The `src/workspace` directory contains the main UI components and panels for the MVMNT application workspace. This is where users interact with the visual editor, timeline, properties, and scene elements. The workspace provides a comprehensive interface for creating and editing MIDI-driven motion graphics.

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

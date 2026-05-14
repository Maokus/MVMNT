# Timeline Panel

This directory implements the MVMNT timeline editor — the main panel for composing MIDI tracks, audio tracks, and automation over time.

## File Structure

### Root files

- **TimelinePanel.tsx** — Root component. Composes hooks and sub-components. Should remain layout and wiring only; avoid adding logic here.
- **TimelineRuler.tsx** — Tick/beat ruler with playhead scrubbing. Reads `timelineView` from the store.
- **TransportControls.tsx** — Play/pause/stop/record transport buttons.
- **constants.ts** — Shared layout constants (`RULER_HEIGHT`, `AUTOMATION_ROW_HEIGHT`, etc.).
- **index.ts** — Public re-exports for the panel entry point.

### hooks/

Custom hooks that extract all non-trivial logic from `TimelinePanel`. See [`hooks/AGENTS.md`](hooks/AGENTS.md) for details.

### utils/

Pure functions with no React dependencies.

- **fileTypeUtils.ts** — `isMidiFile` / `isAudioFile` predicates and their regex constants.
- **timelineNavUtils.ts** — `zoomAround`, `getContentEndTick`, `isEditableTarget`, and the `MIN_RANGE` / `MAX_RANGE` constants used by zoom calculations.

### tracks/

Components for the track rows.

- **TrackList.tsx** — Left sidebar listing track labels with selection, visibility toggle, and the Clips / Automation tab switcher.
- **TrackLanes.tsx** — Right content area rendering MIDI/audio clips inside the timed grid.
- **TrackEditorRow.tsx** — Individual track row: waveform/note preview, trim handles, offset controls, and per-track actions.

### automation/

Components for the automation (keyframe) overlay layer.

- **AutomationLanes.tsx** — Grid of automation curve lanes aligned to the timeline.
- **AutomationLaneRow.tsx** — Single automation parameter row.
- **AutomationCurvePane.tsx** — Expanded curve editor within a lane row.
- **AutomationTrackLabels.tsx** — Left-sidebar labels for automation parameter rows.
- **TempoAutomationLane.tsx** / **TempoLaneHeader.tsx** / **TempoKeyframeLabel.tsx** — Specialised UI for the tempo automation lane.
- **EasingPicker.tsx** / **InterpolationPicker.tsx** — Keyframe interpolation style controls.

### header/

Components rendered in the top header bar of the panel.

- **TimeIndicator.tsx** — Current time display (bars:beats or seconds).
- **HeaderRightControls.tsx** — View controls: follow toggle, zoom presets, quantize selector, and overflow menu.

### modals/

Modal dialogs for import decision flows.

- **MidiImportModeModal.tsx** — Prompts "import as single track or split by MIDI track?".
- **MidiTempoImportModal.tsx** — Prompts how to handle a tempo map embedded in a MIDI file.

### context/

React contexts scoped to the timeline panel.

- **curveHeightContext.tsx** — Shared expanded curve pane height for automation rows.
- **curveRangeContext.tsx** — Shared Y-axis value range for the curve editor.

## Key Architectural Notes

- All tick-based math uses **canonical PPQ** (`CANONICAL_PPQ` from `@core/timing/ppq`). Never hardcode raw tick values.
- View state (`startTick` / `endTick`) lives in `timelineStore.timelineView`. Event callbacks must read it via `useTimelineStore.getState()` — not from React state — to avoid stale closures.
- The gesture system (pinch, middle-drag, space-drag, wheel zoom) is entirely in `useTimelinePointerControls`. Add new gestures there.
- Import logic flows: file input / drop → `useMidiImport` or `useAudioImport` → modal prompts via `useImportModals` → store actions (`addMidiTrack` / `addAudioTrack`).
- The `void timeline;` line in `TimelinePanel` is intentional: it subscribes to general timeline state without passing the value anywhere, ensuring the component re-renders when the store changes.

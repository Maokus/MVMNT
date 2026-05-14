# Timeline Hooks

Custom hooks that extract all non-trivial logic from `TimelinePanel`. Each hook has a single, clearly-named responsibility.

## Import hooks

### useImportModals.ts
Manages the **promise-resolver pattern** for the two MIDI import modal dialogs. Callers `await requestImportMode(...)` or `await requestTempoImport(...)`, which suspend the async import flow until the user dismisses the modal via the corresponding `resolve*` callback.

Exports: `MultiTrackChoice`, `MultiTrackDecisionState` (types re-used by `useMidiImport`).

### useMidiImport.ts
Handles MIDI file parsing, optional tempo-map extraction, and single-vs-split track import. Depends on `useImportModals` callbacks passed as options.

Returns: `fileRef` (hidden `<input>` ref), `importMidiFile(file)`, `handleAddFile` (onChange handler).

### useAudioImport.ts
Validates and imports audio files into the store. Guards against MIDI files being dropped on the audio input.

Returns: `audioFileRef`, `importAudioFile(file)`, `handleAddAudio` (onChange handler).

## Interaction hooks

### useFileDrop.ts
Manages the drag-and-drop overlay. Uses a counter-based enter/leave scheme to correctly handle child elements triggering drag events. Deduplicates dropped files and dispatches them to `importMidiFile` or `importAudioFile`.

Returns: `isDragActive`, and five `onPanel*` event handlers to spread onto the panel root div.

### useTimelinePointerControls.ts
All pointer and touch gesture handling for the right (lanes) pane:
- Middle-button drag → pan
- Space + left-drag → pan
- Two-finger pinch → zoom
- Ctrl/Cmd + wheel → zoom around cursor
- Horizontal wheel → pan (consumed to prevent browser back-navigation)
- Scroll sync: converts native `scrollLeft` into tick view shifts
- Safari `gesturestart/change/end` prevention

Returns: `lanesScrollRef`, `setRightPaneEl`, and three `onRightPointer*` handlers.

**Note:** `rightPaneEl` state update is the indirect trigger that ensures `lanesScrollRef.current` is populated before the scroll-sync and gesture-prevention effects run.

### useTimelineNavigation.ts
View preset callbacks and global keyboard shortcuts.

**Callbacks:** `fitAll`, `zoomToSelection`, `centerOnPlayhead`, `frameSelection`.

**Keyboard shortcuts registered:**
| Key | Action |
|-----|--------|
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `Shift+1` | Fit all |
| `Shift+2` | Zoom to selection |
| `F` | Frame selection or playhead |
| `S` | Toggle snap on/off |
| `←` / `→` | Nudge playhead ±1 beat (±1 bar with Shift) |
| `Delete` / `Backspace` | Remove selected tracks |

All shortcuts skip when focus is in a text-editable element.

### useAutoFollow.ts
Nudges the timeline view window during playback to keep the playhead within the inner 10–85% of the visible range. Takes `follow: boolean` as a parameter.

### useRowHeightSync.ts
Measures the timeline body height via `ResizeObserver` and auto-sizes track rows so they fill the available panel height. Only active on the `'clips'` tab.

Returns: `timelineBodyRef` to attach to the body container div.

## Pre-existing hooks

- **useSnapTicks.ts** — Snaps a tick value to the current quantize grid setting.
- **useTickScale.ts** — Pixel ↔ tick coordinate conversion based on the current view range.
- **useTimeScale.ts** — Tick ↔ seconds conversion using the master tempo map.

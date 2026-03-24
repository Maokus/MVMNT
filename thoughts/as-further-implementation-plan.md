# Phase 8: Timeline Automation Tracks + Bug Fixes

## Context

Phases 1-7 of the automation system are complete: data model, curve evaluator, KeyframeBinding, 7 scene commands with undo, diamond toggle UI in the property panel, React hooks, and persistence at schema version 5. However, the system currently lacks any timeline visualization — users can only toggle keyframes at the current playhead via the property panel's diamond buttons.

This plan adds **timeline automation lanes** (dope-sheet + curve editor) so users can see and edit keyframes visually in the timeline, and fixes four bugs discovered during the audit of the current implementation.

---

## Part 0: Bug Fixes (Session 1)

### A. Missing CSS for KeyframeControl diamond button

The `KeyframeControl.tsx` uses classes `ae-keyframe-toggle` / `ae-keyframe-diamond` with states `inactive`, `active`, `automated` — but no CSS exists. The `.ae-animation-icon` pattern at line 585 of `tailwind.css` shows the convention.

**Modify:** `src/app/tailwind.css` — add `.ae-keyframe-toggle` rules after `.ae-animation-icon` block (~line 593):
- `inactive`: dim fill `#555`, hover fills accent
- `automated`: transparent fill, accent stroke (outlined diamond)
- `active`: solid accent fill, hover turns red-ish (removal hint)

### B. enablePropertyAutomation undo loses macro bindings

In `commandGateway.ts`, the undo for `enablePropertyAutomation` only captures `constant` binding value. If the property was macro-bound, undo loses the macro.

**Modify:** `src/state/scene/commandGateway.ts` (~line 486-503) — capture the full previous binding state. If it was a macro, the undo array dispatches `disablePropertyAutomation` then `updateElementConfig` to restore the macro binding.

### C. Orphaned automation channels on binding type change

If an automated property gets changed to a macro/constant via `updateElementConfig`, the channel persists unreferenced.

**Modify:** `src/state/sceneStore.ts` — in the binding update path, when a binding transitions from `keyframes` to another type, clean up the corresponding automation channel.

### D. disablePropertyAutomation fallback uses first keyframe value instead of current tick

**Modify:** `src/state/scene/commandGateway.ts` (~line 740-758) — when no `fallbackValue` is provided, evaluate the automation curve at the current playhead tick (via `AutomationCurve`) so the value "freezes" at what the user sees, rather than always snapping to the first keyframe's value.

---

## Part 1: State & Selectors (Session 1)

### Interaction state for automation UI

**Modify:** `src/state/sceneStore.ts` — add to `SceneInteractionState`:
- `automationExpandedElements: string[]` — element IDs expanded in the automation section
- `automationExpandedCurves: string[]` — channelIds with curve editor open
- `automationSelectedKeyframes: Array<{ channelId: string; tick: number }>` — multi-select

### Selectors

**New file:** `src/automation/selectors.ts`
- `selectAutomatedElements(state)` → ordered list of `{ elementId, elementName, channels[] }` for elements with automation
- `selectVisibleAutomationRowCount(state)` → total number of visible automation rows (for height calc)

### Hooks

**Modify:** `src/automation/hooks.ts` — add:
- `useElementChannels(elementId)` → all channels for an element
- `useAutomatedElementIds()` → element IDs that have automation
- `useAutomationExpanded(elementId)` → expanded state
- `useCurveEditorExpanded(channelId)` → curve editor state

---

## Part 2: Timeline Automation Labels — Left Column (Session 1)

### AutomationTrackLabels

**New file:** `src/workspace/panels/timeline/AutomationTrackLabels.tsx`

Renders below track rows in the left column:
- Section header: "AUTOMATION" with expand/collapse-all toggle
- For each automated element: collapsible element header row
- Under each element: channel label rows (property name + delete `[x]` + copy `[C]` buttons)

Uses `AUTOMATION_HEADER_HEIGHT` (24px) for element headers, `AUTOMATION_ROW_HEIGHT` (28px) for channel rows.

### Constants

**Modify:** `src/workspace/panels/timeline/constants.ts` — add:
```
AUTOMATION_ROW_HEIGHT = 28
AUTOMATION_HEADER_HEIGHT = 24
CURVE_EDITOR_HEIGHT = 120
```

### Integration

**Modify:** `src/workspace/panels/timeline/TrackList.tsx` — render `<AutomationTrackLabels />` after track rows.

---

## Part 3: Dope-Sheet Lanes — Right Column (Session 2)

### AutomationLanes container

**New file:** `src/workspace/panels/timeline/AutomationLanes.tsx`

Renders below track lane rows in the right column. Container for `AutomationLaneRow` per visible channel. Shares the same `GridLines` vertical grid.

### AutomationLaneRow (SVG dope-sheet)

**New file:** `src/workspace/panels/timeline/AutomationLaneRow.tsx`

Per-channel SVG row rendering keyframe diamonds along the timeline:
- Compute x position via `useTickScale().toX(kf.tick, width)` (reuse existing util)
- Diamond SVG `<path>` per keyframe, filled/outlined based on selection state
- Thin interpolation preview line between adjacent keyframes

**Interactions (follow `TrackRowBlock` drag pattern from TrackLanes.tsx:64-211):**
- Click empty space → `addKeyframe` at snapped tick with interpolated value
- Click diamond → select; shift-click → multi-select
- Drag diamond → `moveKeyframe` with pointer capture + `snapTicks()` + `mergeKey` for undo coalescing
- Delete key → `removeKeyframe` for each selected keyframe
- Double-click diamond → inline value input

### Integration

**Modify:** `src/workspace/panels/timeline/TrackLanes.tsx` — render `<AutomationLanes width={width} />` after track lane row divs.

**Modify:** `src/workspace/panels/timeline/TimelinePanel.tsx` — adjust row height calculation to subtract automation section height from available space.

### Copy/Paste infrastructure

**New file:** `src/automation/clipboard.ts` — module-level `AutomationClipboard` (transient, in-memory only):
- `copyChannel(channel)`, `getClipboard()`, `clearClipboard()`

**Modify:** `src/state/scene/commandGateway.ts` — add commands:
- `pasteAutomationChannel` — enables automation on target if needed, batch-replaces keyframes
- `clearAutomationKeyframes` — removes all keyframes without disabling automation

---

## Part 4: Curve Editor + Easing Picker (Session 3)

### AutomationCurvePane

**New file:** `src/workspace/panels/timeline/AutomationCurvePane.tsx`

Expandable pane (120px) below each lane row:
- Background with horizontal value grid lines (0%-25%-50%-75%-100%)
- Sampled polyline `<polyline>` between keyframe pairs showing the easing curve
- Keyframe control points at (tick→x, value→y)
- Drag control point vertically → `updateKeyframe` with `patch: { value }`
- Click segment → open easing picker

### EasingPicker popover

**New file:** `src/workspace/panels/timeline/EasingPicker.tsx`

Grid of 31 easing function thumbnails (tiny SVG curve previews), grouped by family (Quad, Cubic, Sine, etc.). Uses `src/math/animation/easing.ts` keys directly as `easingId`. Click dispatches `updateKeyframe` with `patch: { easingId }`.

### Right-click context menu

On automation lanes: Change easing, Copy channel, Paste keyframes, Clear keyframes, Delete automation, Change interpolation mode (Linear/Stepped/Eased).

### CSS

**Modify:** `src/app/tailwind.css` — add `.ae-automation-*`, `.ae-lane-keyframe`, `.ae-curve-*`, `.ae-easing-*` rules.

---

## Key Design Decisions

1. **Automation section is appended below tracks, not interleaved.** Tracks are audio/MIDI; automation belongs to scene elements. A visually separated section with its own "AUTOMATION" header.

2. **SVG-based rendering matches existing `GridLines` pattern.** Keyframe diamonds and curve lines fit naturally.

3. **Drag reuses `TrackRowBlock` pointer capture pattern** from `TrackLanes.tsx:138-211` — `onPointerDown`/`onPointerMove`/`onPointerUp` with `startRef`, `setPointerCapture`, `snapTicks`.

4. **Undo coalescing uses existing `mergeKey` pattern** — `kf-drag:${channelId}:${sessionId}` collapses continuous drag into a single undo entry.

5. **Curve editor is opt-in per channel** — toggle expands a 120px pane. Most users only need the dope-sheet.

6. **Fixed automation row height** (28px) — simpler than auto-sizing, sufficient for diamond display.

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/automation/selectors.ts` | Derived selectors for automated elements & row count |
| `src/automation/clipboard.ts` | In-memory clipboard for channel copy/paste |
| `src/workspace/panels/timeline/AutomationTrackLabels.tsx` | Left column: element headers + channel labels |
| `src/workspace/panels/timeline/AutomationLanes.tsx` | Right column: container for dope-sheet rows |
| `src/workspace/panels/timeline/AutomationLaneRow.tsx` | SVG dope-sheet per channel with drag interactions |
| `src/workspace/panels/timeline/AutomationCurvePane.tsx` | Expandable curve editor per channel |
| `src/workspace/panels/timeline/EasingPicker.tsx` | Easing function selection popover |

## Modified Files Summary

| File | Changes |
|------|---------|
| `src/app/tailwind.css` | Bug A fix + all automation timeline CSS |
| `src/state/scene/commandGateway.ts` | Bugs B+D + paste/clear commands |
| `src/state/sceneStore.ts` | Bug C + interaction state for automation UI |
| `src/automation/hooks.ts` | New hooks (element channels, expanded state) |
| `src/workspace/panels/timeline/constants.ts` | Automation row height constants |
| `src/workspace/panels/timeline/TrackList.tsx` | Render AutomationTrackLabels below tracks |
| `src/workspace/panels/timeline/TrackLanes.tsx` | Render AutomationLanes below track lanes |
| `src/workspace/panels/timeline/TimelinePanel.tsx` | Adjust row height calc for automation rows |

## Session Phasing

| Session | Scope | Verification |
|---------|-------|-------------|
| **Session 1** | Bug fixes A-D + state/selectors/hooks + AutomationTrackLabels + TrackList integration + constants | Left column shows automation element groups and channel labels; `tsc --noEmit` passes |
| **Session 2** | AutomationLanes + AutomationLaneRow + TrackLanes integration + TimelinePanel height calc + clipboard + paste/clear commands | Dope-sheet is interactive: click to add, drag to move, select + delete keyframes; `tsc --noEmit` passes |
| **Session 3** | AutomationCurvePane + EasingPicker + context menus + CSS polish + tests | Full curve editor with easing control; all tests pass; `tsc --noEmit` passes |

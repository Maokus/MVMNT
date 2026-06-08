# Timeline Fixed-Height Tracks with 2D Scrolling

**Date:** 2026-06-08  
**Status:** Proposal

## Problem

The clips tab currently sizes tracks dynamically: `rowHeight = (panelHeight - RULER_HEIGHT) / trackCount`, clamped to 16–160px (`useRowHeightSync.ts:42–53`). This means every track always fits on screen, but the trade-off is that track height shrinks as you add more tracks — at 8+ tracks rows become cramped and controls start collapsing. It also means you can never zoom in vertically on a single track.

The automation tab already avoids this problem: lanes are fixed at 28px each (`AUTOMATION_ROW_HEIGHT` in `constants.ts`) and the container simply scrolls when there are more lanes than fit.

## Goal

Make the clips tab behave the same way: fixed track height, vertical scroll when tracks overflow the panel, horizontal scroll unchanged.

---

## Current Layout (simplified)

```
timeline-body (overflow: hidden)
  └─ shared-scroll-wrapper (overflow-y: auto, overflow-x: hidden)  ← already exists
      └─ flex row (min-h: 100%)
          ├─ tracklist-container (w-60, shrink-0)
          │   └─ TrackList  ← track labels, one per track
          └─ right-pane (flex-1)
              ├─ TimelineRuler (sticky top-0)
              └─ lanesScrollRef (flex-1)
                  ├─ TrackLanes  ← track lane bodies
                  └─ AutomationLanes
```

The `shared-scroll-wrapper` already has `overflow-y: auto`. Vertical scrolling doesn't trigger today only because `TrackLanes` is `flex-1` — its total height is always constrained to the available space. Both columns share the same scroll container, so they'd scroll in unison for free once the height constraint is removed.

---

## Proposed Changes

### 1. Add a `DEFAULT_TRACK_HEIGHT` constant

In `constants.ts`, add:

```typescript
export const DEFAULT_TRACK_HEIGHT = 64; // px, fixed height for clips tab track rows
```

64px gives enough room for the track controls (name pill, mute/solo, etc.) without wasting space. The existing min/max range in `useRowHeightSync` (16–160px) can inform future per-track resizing if desired.

### 2. Remove dynamic height calculation for the clips tab

`useRowHeightSync.ts` currently runs only when `activeTab === 'clips'`. Either:

- Delete the hook entirely and stop calling it from `TimelinePanel`, or
- Keep the hook but gate it behind a feature — useful if we want to restore the "auto-fit" mode as an option later.

The `rowHeight` Zustand store value would be initialised to `DEFAULT_TRACK_HEIGHT` instead of being computed.

### 3. Stop constraining `TrackLanes` to `flex-1`

`TrackLanes` is currently `relative flex-1` in the right pane, which caps its height to the available panel area. Change it to allow natural height:

```
right-pane (flex-1, flex-col)
  ├─ TimelineRuler (sticky top-0, z-10)     ← unchanged
  └─ TrackLanes + AutomationLanes           ← remove flex-1; let height be intrinsic
```

With each track row at a fixed `DEFAULT_TRACK_HEIGHT` px and no `flex-1` cap, `TrackLanes`'s total height will be `trackCount * DEFAULT_TRACK_HEIGHT`. When that exceeds the panel, `shared-scroll-wrapper`'s `overflow-y: auto` kicks in and the user scrolls vertically.

### 4. Ensure `TrackList` rows match `TrackLanes` rows

`TrackList` renders rows in the left column. Because both columns are children of the same `shared-scroll-wrapper` flex row, their rows must have identical heights to stay aligned. Both currently read from the same `rowHeight` Zustand value, so switching to a fixed constant propagates automatically — no extra sync needed.

The `TrackEditorRow` already scales its internal controls by `rowHeight` (`TrackEditorRow.tsx:35–38`). At a fixed 64px those clamps should land in comfortable territory (`controlSize ≈ 22px`, `pillHeight ≈ 20px`, `fontSize ≈ 12px`).

### 5. Ruler stays pinned

`TimelineRuler` is already `sticky top-0 z-10` in the right pane, so it stays visible regardless of how far the user scrolls vertically. The left-column track header (tab bar + search) is handled by the panel header above the body, which is outside the scroll container — it stays pinned by layout, not CSS sticky.

### 6. Horizontal scroll is unchanged

Horizontal pan/zoom operates entirely through the tick viewport (`setTimelineViewTicks`) — it never uses native `scrollLeft`. Nothing about this proposal affects that.

---

## What Doesn't Need to Change

| Thing                                      | Reason                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `useTimelinePointerControls`               | Horizontal pan/zoom is tick-based; vertical scroll is native, handled by the browser |
| `useTickScale`                             | Pure tick→pixel math, no height involvement                                          |
| Automation lanes                           | Already fixed-height, already in the same scroll container                           |
| `curveHeightContext` / `curveRangeContext` | Operate within automation section, unaffected                                        |
| Horizontal scroll interception logic       | No change to tick viewport system                                                    |

---

## Stretch Goals (not in scope for initial implementation)

### Per-track height resizing

Allow the user to drag the bottom border of a track header to resize individual tracks. This would require:

- A `trackHeights: Record<trackId, number>` map in the timeline store (currently a single shared `rowHeight`)
- A drag handle on `TrackEditorRow`
- Both `TrackList` and `TrackLanes` reading from the map instead of the scalar

Start with a single fixed height and add per-track resizing in a follow-up.

### Keyboard/scroll-to-track

Once tracks can scroll off screen, it becomes useful to have a "scroll to selected track" action that brings the active track into view (`scrollIntoView` on the track row element).

### Double-click track header to zoom vertically

A shortcut to temporarily expand a single track to fill the panel, then collapse back. Common in DAWs.

---

## Risk / Edge Cases

- **Very few tracks (1–2):** With fixed heights there will be empty space below. That's acceptable — it matches how the automation panel behaves and how every major DAW works. If desired, a "fill panel" toggle could restore the old behaviour.
- **`useRowHeightSync` ResizeObserver teardown:** If we remove the hook, make sure the ResizeObserver is properly cleaned up. No issue if we just stop calling the hook from `TimelinePanel`.
- **Automation lanes height:** `AutomationLanes` renders below `TrackLanes` in the same scroll container. Their combined height continues to drive the scroll extent — this is already how it works, just now with a larger `TrackLanes` contribution when there are many tracks.

---

## Summary of File Changes

| File                  | Change                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| `constants.ts`        | Add `DEFAULT_TRACK_HEIGHT = 64`                                            |
| `useRowHeightSync.ts` | Delete or disable for clips tab                                            |
| `TimelinePanel.tsx`   | Stop calling `useRowHeightSync`; remove `flex-1` from `TrackLanes` wrapper |
| `useTimelineStore`    | Initialise `rowHeight` to `DEFAULT_TRACK_HEIGHT` rather than computing it  |
| `TrackEditorRow.tsx`  | No change needed (already reads `rowHeight` from store)                    |
| `TrackLanes.tsx`      | No change needed (already applies `rowHeight` inline per row)              |

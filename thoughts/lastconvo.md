Plan written to `thoughts/ableton-style-clip-editing-plan.md`. Here's the summary:

**Three gaps identified vs current implementation:**

1. **Cross-track drag** (Phase 2) — the biggest missing feature. Currently clips can only move horizontally. Fix requires: a new `timeline.moveMidiClipsBetweenTracks` command, extending `MidiClipBlock` drag to track `dy` → target row, store-level `_crossTrackDrag` state for the ghost overlay in `TrackLanes`, and hiding the source clip during drag.

2. **Explicit clip selection** (Phase 1, do first) — the current range-based selection is imprecise for individual clip picking. Shift+clicking clip A on track 1 and clip B on track 3 would accidentally capture all clips on track 2 in between. Adding a `type: 'clips'` variant to `ClipTimelineSelection` fixes this, and enables shift/cmd+click to add/toggle individual clips.

3. **UX polish** (Phase 3) — Cmd+A to select all, Escape to clear, Alt+drag to duplicate.

The multi-track copy/paste in the clipboard format already works correctly — the gaps are all in the selection model and drag UX.

Made changes.

User: Proceed with fixing those gaps. In addition, fix the following issues:

- When I have something selected and start dragging to create a new selection box, I would like the previous selection box to disappear.
- Add support for cmd+d for duplicate(which puts a copy of the clip immediately after the current clip), cmd+x for cut
- make selections abide by the snapping options

Claude: Created 5 todos

Let me read all the files I need before writing any code.

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/selectionStore.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/workspace/panels/timeline/hooks/useMarqueeSelect.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/workspace/panels/timeline/hooks/useTimelineNavigation.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/patches.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/commandTypes.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/commands/midiClipCommands.ts)

Now let me check the timelineStore actions and commandRegistry.

Searched for regex `moveMidiClipsBetweenTracks|removeMidiClips|updateMidiClip\b|setMultipleMidiClip|_clipGroupDrag|_crossTrackDrag`

Searched for files matching `src/state/timeline/commandRegistry.ts`

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/commandRegistry.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/__tests__/selectionStore.timelineClips.test.ts)

Now let me read the timelineStore to understand what I need to add.

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timelineStore.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timelineStore.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/workspace/panels/timeline/hooks/useSnapTicks.ts)

I have all the context I need. Let me now implement everything in one coordinated push.

Starting: _Phase 1: Add type:clips selection variant to selectionStore + MidiClipBlock + TrackLanes_ (1/5)

Starting with the selection model, command infrastructure, then the UI components.

```

```

Now update `midiClipClipboard.ts` — re-export `TimelineClipRef` from the store and handle `type: 'clips'` in all relevant functions.

```

```

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/workspace/panels/timeline/clipboard/midiClipClipboard.ts)

The edit was malformed. Let me rewrite the whole file cleanly.

```

```

Now add the new command ID, patch type, command implementation, and register it — all in parallel.

```

```

Now add the `createMoveMidiClipsBetweenTracksCommand` to `midiClipCommands.ts`:

```

```

Now register the new command in the registry:

```

```

```

```

```

```

Now add `_crossTrackDrag` state and `moveMidiClipsBetweenTracks` to the timeline store:

```

```

```

```

```

```

Now I need to add `_crossTrackDrag: null` to the initial slice, add `_setCrossTrackDrag` action, and add `moveMidiClipsBetweenTracks` action. Let me find the right places:

```

```

```

```

```

```

```

```

Starting: _Phase 2: Cross-track clip drag (command + store state + MidiClipBlock + TrackLanes)_ (2/5)

Now rewrite `MidiClipBlock.tsx` with all the new behavior — `type: 'clips'` selection, shift+click, cross-track drag, trackIndex/rowHeight props:

```

```

Now pass `trackIndex` and `rowHeight` from `TrackRowBlock.tsx`. First let me see the MidiClipBlock usage in TrackRowBlock:

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/workspace/panels/timeline/tracks/TrackRowBlock.tsx)

```

```

```

```

```

```

Now update `TrackLanes.tsx` — pass `trackIndex`, add `type: 'clips'` overlay, ghost clips, and clear selection on marquee start. This requires a complete rewrite of the selection overlay logic and adding ghost/highlight rendering:

```

```

Starting: _Fix: Clear selection when starting a new marquee drag_ (3/5)

Now update `useMarqueeSelect.ts` — clear selection on pointer down, add snapping:

```

```

Starting: _Add Cmd+D duplicate (paste immediately after) and Cmd+X cut_ (4/5)

Now update `useTimelineNavigation.ts` — handle `type: 'clips'` everywhere, add Cmd+D, Cmd+X, Cmd+A:

```

```

Good. Now let me also update the test file to add a test for `type: 'clips'`:

```

```

Now let me run the typecheck to catch any issues:

Ran terminal command: npx tsc --noEmit 2>&1 | head -80

Ran terminal command: npx tsc --noEmit 2>&1 | head -80

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/commands/midiClipCommands.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/commands/midiClipCommands.ts)

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/state/timeline/commands/midiClipCommands.ts)

The `export function createPasteMidiClipsCommand(` line got eaten. Let me fix it:

```

```

Ran terminal command: npx tsc --noEmit 2>&1 | head -60

Ran terminal command: npx tsc --noEmit 2>&1 | head -60

Read [](file:///Users/markus/webdev/VISUALISERS/MVMNT/src/workspace/panels/timeline/tracks/__tests__/midiClipRow.test.tsx)

```

```

_Conversation compacted_

Made changes.

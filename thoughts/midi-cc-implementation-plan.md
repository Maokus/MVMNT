# MIDI CC Implementation Plan

_Written 2026-04-08_

## Motivation

Currently the visualiser can read note on/off data from MIDI tracks but drops all other MIDI messages during import — Control Change (CC) messages, in particular. The most immediately useful CC message is sustain pedal (CC 64), but the same infrastructure would also unlock expression (CC 11), modulation (CC 1), pitch bend, and any custom automation a user puts in their DAW.

---

## Current state of the parser pipeline

`src/core/midi/midi-parser.ts` → `convertToPlayableEvents()` filters to `noteOn | noteOff` only; CC events are recognised (`type: 'controlChange'`) but silently dropped.

`MIDIEvent` in `src/core/types.ts` already has a `'controlChange'` variant in its type union, with controller number reusing the `note` field and value reusing `velocity`. This is a quirk of the current shared type — it works but is semantically odd and should be cleaned up as part of this work.

---

## Step 1 — New canonical types

**File: `src/core/timing/types.ts`** (alongside `TimelineNoteEvent`, `TempoMapEntry`)

```typescript
/** A single MIDI Control Change message, stored in seconds-domain time. */
export interface TimelineCCEvent {
    trackId: string;
    channel: number;
    controller: number;   // 0–127, e.g. 64 = sustain pedal
    value: number;        // 0–127
    timeSec: number;      // absolute timeline seconds
}
```

**File: `src/state/timelineTypes.ts`** (alongside `NoteRaw`)

```typescript
/** Raw CC event stored in ticks, before seconds conversion. */
export interface CCEventRaw {
    channel: number;
    controller: number;
    value: number;
    tick: number;
}
```

---

## Step 2 — Parser changes

**File: `src/core/midi/midi-parser.ts`**

1. In `convertToPlayableEvents()`, change the final `.filter()` to also retain `controlChange` events:

   ```typescript
   // Before
   allEvents.filter(event => event.type === 'noteOn' || event.type === 'noteOff')

   // After
   allEvents.filter(event =>
       event.type === 'noteOn' ||
       event.type === 'noteOff' ||
       event.type === 'controlChange'
   )
   ```

2. In whatever function builds `MIDIData` (the return value of the parser), separate CC events from note events and return them as a dedicated `ccEvents: CCEventRaw[]` field on `MIDIData`.

   The `MIDIEvent` `note` / `velocity` field reuse for CC data is a parser-detail leakage that should stay encapsulated — extract clean `CCEventRaw` structs here so callers never see the quirky shared type.

---

## Step 3 — Store shape

**File: `src/state/timelineTypes.ts`**

Add `ccRaw` alongside `notesRaw` in the `midiCache` entry:

```typescript
interface MidiCache {
    midiData: MIDIData;
    notesRaw: NoteRaw[];
    ccRaw: CCEventRaw[];         // new
    ticksPerQuarter: number;
    tempoMap?: TempoMapEntry[];
}
```

**File: wherever MIDI is imported into state** (the action/thunk that populates `midiCache`)

Pass `midiData.ccEvents` through to `ccRaw` at the same point `notesRaw` is populated.

---

## Step 4 — Selectors

**File: `src/state/selectors/timelineSelectors.ts`**

Add a selector that converts raw ticks to seconds and filters by time window and optionally by controller number:

```typescript
export function selectCCInWindow(
    state: TimelineState,
    args: {
        trackIds?: string[];
        controller?: number;   // omit to return all controllers
        startSec: number;
        endSec: number;
    }
): TimelineCCEvent[]
```

The tick-to-seconds conversion should follow the same pattern as the note selectors (using `tempoMap` + `ticksPerQuarter`).

For sustain pedal specifically a helper could be added:

```typescript
export function selectSustainStateAtTime(
    state: TimelineState,
    args: { trackIds?: string[]; timeSec: number }
): boolean  // true if pedal is held at timeSec
```

This works by finding the most recent CC 64 event at or before `timeSec` and checking whether its value ≥ 64 (the standard MIDI threshold).

---

## Step 5 — Plugin API surface

**File: `src/core/scene/plugins/host-api/plugin-api.ts`**

Add to `PluginTimelineApi`:

```typescript
/** Returns CC events in the given time window, optionally filtered by controller number. */
selectCCInWindow(args: {
    trackIds?: string[];
    controller?: number;
    startSec: number;
    endSec: number;
}): TimelineCCEvent[];

/** Returns true if sustain pedal (CC 64) is held at the given time. */
getSustainStateAtTime(args: {
    trackIds?: string[];
    timeSec: number;
}): boolean;
```

No new `PLUGIN_CAPABILITIES` key is needed — CC data is timeline data, so `PLUGIN_CAPABILITIES.timelineRead` is the correct gate.

Implement both by delegating to the new selectors in `createPluginHostApi()`.

Export `TimelineCCEvent` from `plugin-sdk.ts` (alongside `TimelineNoteEvent`).

---

## Step 6 — Drift prevention

**File: `src/core/scene/plugins/__tests__/api-drift.test.ts`**

Add tests verifying:
- `selectCCInWindow` is callable and returns an array
- `getSustainStateAtTime` is callable and returns a boolean
- `TimelineCCEvent` is exported from the SDK

---

## Usage example in an element

```typescript
import {
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type TimelineCCEvent,
} from '@mvmnt/plugin-sdk';

const { api } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

// Is the sustain pedal currently held?
const sustained = api?.timeline.getSustainStateAtTime({
    trackIds: [props.midiTrackId],
    timeSec: targetTime,
}) ?? false;

// All expression (CC 11) events in a 4-second window
const expressionEvents: TimelineCCEvent[] = api?.timeline.selectCCInWindow({
    trackIds: [props.midiTrackId],
    controller: 11,
    startSec: targetTime - 2,
    endSec: targetTime + 2,
}) ?? [];
```

---

## Scope notes

- **Pitch bend** is a separate MIDI message type (not CC). It could be added later with identical infrastructure — add a `PitchBendEventRaw`, a `TimelinePitchBendEvent`, and a `selectPitchBendInWindow` selector.
- **Channel pressure / aftertouch** follows the same pattern.
- The parser currently treats CC controller numbers as the `note` field on `MIDIEvent`. This is fine to leave as a parser implementation detail as long as the clean `CCEventRaw` type is what exits the parser boundary.
- Existing `midiCache` entries in persisted scenes will be missing `ccRaw`. The store initialisation / migration code should default `ccRaw` to `[]` if absent.

# MIDI Ingestion Pipeline — Capabilities & MPE Assessment

_Researched May 2026_

## Pipeline Overview

MIDI files flow through three stages before reaching scene elements:

```
File → MIDIParser → buildNotesFromMIDI (ingest) → Timeline Store → Plugin API
```

### Stage 1: `MIDIParser` (`src/core/midi/midi-parser.ts`)

A hand-rolled binary parser operating on the raw `.mid` ArrayBuffer. Processes:

- **File header**: format (0/1/2), track count, division (PPQ or SMPTE)
- **Per-track events**: running status, variable-length delta times
- **Tempo map**: collected from `0xFF 0x51` Set Tempo meta events; used to build a piecewise-linear tick→seconds conversion table

**Event types parsed:**

| MIDI message      | Status byte    | Stored as       | Notes                                                          |
| ----------------- | -------------- | --------------- | -------------------------------------------------------------- |
| Note Off          | `0x8n`         | `noteOff`       | channel preserved                                              |
| Note On           | `0x9n` (vel>0) | `noteOn`        | channel, velocity preserved                                    |
| Note On (vel=0)   | `0x9n` (vel=0) | `noteOff`       | treated as note-off                                            |
| Control Change    | `0xBn`         | `controlChange` | controller# in `note`, value in `velocity`, channel preserved  |
| Program Change    | `0xCn`         | `programChange` | stored but not forwarded downstream                            |
| Pitch Bend        | `0xEn`         | `pitchBend`     | **parsed into event but discarded — not forwarded**            |
| Channel Pressure  | `0xDn`         | (default case)  | **silently skipped — 1 byte consumed, event not emitted**      |
| Poly Key Pressure | `0xAn`         | (default case)  | **silently skipped — 2 bytes consumed, event not emitted**     |
| SysEx             | `0xF0/F7`      | meta stub       | payload consumed but not stored                                |
| Meta              | `0xFF`         | varies          | Set Tempo and Time Signature fully handled; text events stored |

**Output** (`MIDIData`):

- `events` — note-on/off events only, trimmed and sorted by time (seconds)
- `ccEvents` — all `controlChange` events, trimmed and sorted
- `tempoMap` — array of `{time, tempo}` in seconds, for downstream use
- `trackDetails` — per-track note events and metadata
- `duration` — derived from last note-off time

### Stage 2: `buildNotesFromMIDI` (`src/core/midi/midi-ingest.ts`)

Converts the raw event stream into typed domain objects:

- **Notes** (`NoteRaw`): note number, channel, startTick, endTick, beats, velocity. Unmatched note-ons get a 1-beat fallback duration.
- **CC events** (`CCEventRaw`): channel, controller, value, tick. Stored without seconds-domain time (resolved via tempo map at query time).
- Normalises PPQ to `CANONICAL_PPQ` via scaling.

### Stage 3: Timeline Store & Plugin API

Notes and CC events are stored in the timeline store by track. Scene elements query them via:

- `api.timeline.selectNotesInWindow({ trackIds, startSec, endSec })` → `TimelineNoteEvent[]`
- `api.timeline.selectCCInWindow({ trackIds, controller?, startSec, endSec })` → `TimelineCCEvent[]`
- `api.timeline.getSustainStateAtTime({ trackIds, timeSec })` → `boolean` (shortcut for CC 64)

`TimelineNoteEvent` exposes: `note`, `channel`, `startTime`, `endTime`, `velocity`  
`TimelineCCEvent` exposes: `trackId`, `channel`, `controller`, `value`, `timeSec`

---

## MPE (MIDI Polyphonic Expression) Assessment

MPE (defined in the MIDI 2.0 / MMA spec) expresses per-note articulation by assigning each note its own MIDI channel. A typical MPE zone uses:

- Channel 1 — _global_ channel (pitch bend range, global CC)
- Channels 2–16 — _member_ channels, one per sounding note

Per-note expression is carried on the member channel **before** the note-on, simultaneous with it, and during the note's sustain:

- **Pitch Bend** (0xEn): per-note pitch deviation
- **Channel Pressure** (0xDn): per-note pressure / aftertouch
- **CC 74** (brightness/slide, 0xBn controller 74): per-note timbre

### What the current pipeline supports

| MPE data point          | Parsed?                          | Stored?                                         | Queryable?                                                   |
| ----------------------- | -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Note channel assignment | Yes                              | Yes (`channel` on `NoteRaw`)                    | Yes (via `selectNotesInWindow`, `TimelineNoteEvent.channel`) |
| CC 74 (slide/timbre)    | Yes                              | Yes (`CCEventRaw`)                              | Yes (via `selectCCInWindow({ controller: 74 })`)             |
| Other per-channel CC    | Yes                              | Yes                                             | Yes                                                          |
| **Pitch Bend**          | Parsed                           | **No — discarded in `convertToPlayableEvents`** | **No**                                                       |
| **Channel Pressure**    | **No — skipped in default case** | No                                              | No                                                           |
| **Poly Key Pressure**   | **No — skipped in default case** | No                                              | No                                                           |

### What works today

An element can approximate MPE awareness by:

1. Reading notes and checking `note.channel` — notes are correctly assigned to their member channels.
2. Querying `selectCCInWindow({ controller: 74 })` and correlating by channel and time to infer slide values per note.

This covers the _timbre/slide_ axis of MPE reasonably well.

### What is missing

- **Pitch Bend**: the parser emits `pitchBend` events but `convertToPlayableEvents()` only collects `controlChange` into `ccEvents`; pitch bend events are never forwarded. An element cannot recover per-note pitch deviations. This is the **most critical gap** for MPE support since pitch bend is the primary expressiveness mechanism.
- **Channel Pressure**: the `parseEvent()` default case calls `getChannelMessageLength()` (returning 1 for 0xD0) and emits a stub meta event — the pressure value is never captured.
- **Polyphonic Key Pressure** (0xA0): same default-case treatment, data consumed but not stored.
- **No pitch-bend store type**: `CCEventRaw` / `TimelineCCEvent` cannot represent pitch bend — it has no native `value` range that maps to ±8192 semitones. A separate `PitchBendEventRaw` type would be needed.
- **No API surface**: `selectCCInWindow` has no equivalent for pitch bend or pressure queries.

### Recommendations (if MPE support is desired)

1. **Capture pitch bend in the parser**: in `parseEvent` case `0xE0`, store the combined 14-bit value `(msb << 7) | lsb` (range 0–16383, centre 8192) and emit it with type `'pitchBend'`.
2. **Forward pitch bend from `convertToPlayableEvents`**: collect pitch bend events alongside CC events (or in a dedicated `pitchBendEvents` array on `MIDIData`).
3. **Add `PitchBendEventRaw` to `timelineTypes.ts`**: `{ channel, tick, value14bit }` — 14-bit value, or normalised to ±1.0.
4. **Add a timeline selector**: `selectPitchBendInWindow({ trackIds, startSec, endSec })` returning `TimelinePitchBendEvent[]`.
5. **Capture channel pressure** (0xD0): add a `channelPressure` event type and similar pipeline.
6. **Optionally capture poly key pressure** (0xA0): lower priority; rarely used even in MPE files.

Implementing steps 1–4 is enough to support the pitch-bend axis of MPE. Steps 5–6 cover the rest of the specification.

**MIDI Performance Investigation:**

The lag comes from **per-frame O(N) note array scans**, not the initial load. Root causes:

| Bottleneck                                                            | Location                                | Frequency                         |
| --------------------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| `selectNotesInWindow` linear scan on all notes                        | `timelineSelectors.ts:79`               | 60 fps per MIDI display element   |
| Infinite-window queries (full file scan) for auto-detect min/max note | piano roll elements, note-count-tracker | Every render frame                |
| No sort index — binary search impossible                              | `timelineStore.ts` midiCache            | Every query                       |
| `computeContentEndTick/Start` iterates all notes                      | `timelineShared.ts:38-103`              | On track add/remove/offset change |

**Proposed fixes (highest → lowest impact):**

1. **Cache bounds on ingest** — store `{ minTick, maxTick, minNote, maxNote }` in the `midiCache` entry. Eliminates full scans in piano rolls and note-count tracker that call `selectNotesInWindow(0, +Infinity)` just to get totals/ranges.

2. **Sort `notesRaw` by `startTick` on ingest** — enables binary search to quickly find the window start, then iterate only until `startTick > endSec`. Turns O(N) window queries into O(log N + results).

3. **Memoize per-element window results** — cache the result of `selectNotesInWindow` keyed on `(trackId, startSec, endSec)` with a stable tick granularity (e.g. ±1 tick tolerance). Avoid recomputing on every frame when the window hasn't meaningfully changed.

4. **Compute `computeContentEndTick` from cached bounds** — once `maxTick` is stored on the cache entry, the full note loop becomes a single property read.

Want me to implement any of these?

Made changes.

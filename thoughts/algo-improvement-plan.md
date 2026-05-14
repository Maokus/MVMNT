Now I have a full picture of the current implementation vs. the documented algorithm. Here's the phased plan:

---

## Phase 1 — Fix defaults and option naming

**Goal:** `DetectOptions` names and defaults match the Python API.

Changes to `musicpy-detect.ts`:

- Rename `preferBassRoot` → `rootPreference`, default `false`
- Change `wholeDetect` default to `true`
- `originalFirst` and `changeFromFirst` already exist as option keys but are never read; wire them in (defaults `true`)
- Add `sameNoteSpecial` option (default `false`)
- Rename `similarityThreshold` → `similarityRatio` (default `0.6`)
- Add `originalFirstRatio` option (default `0.86`)

No logic changes yet — just surface/defaults.

---

## Phase 2 — Implement `originalFirst` + `originalFirstRatio` flow

**Goal:** The original-order result gets its own early-exit path with a different (higher) threshold.

The current code folds original-order and inversion detection into one undifferentiated loop. Correct flow:

1. Compute intervals from `deduplicated[0]` as root (original order only).
2. Run exact lookup. If hit → return immediately (confidence 1.0), regardless of `originalFirst`.
3. If no exact hit, compute similarity for original order against all `CHORD_TYPES`.
    - If `originalFirst=true` AND best score `>= originalFirstRatio` AND result is **not** an altered chord type → return immediately.
    - If `originalFirst=false` → skip this early return (fall through to inversion search).
4. Only after that does the inversion loop begin (trying each rotation as root).

Key invariant from the docs: _"if similarity == 1 (exact), return original order regardless of `originalFirst`"_ — the existing exact-hit path already satisfies this.

---

## Phase 3 — Implement `sameNoteSpecial`

**Goal:** If the input pitch-class set equals a chord's pitch-class set exactly, force similarity to 1.

After computing the original-order similarity in phase 2, add a pre-pass:

```
if (sameNoteSpecial) {
    const inputPCSet = new Set(pcs);
    for (const entry of CHORD_TYPES) {
        for (const rootMidi of deduplicated) {
            const chordPCs = new Set(entry.intervals.map(i => (rootMidi + i) % 12).concat([rootMidi % 12]));
            if (setsEqual(inputPCSet, chordPCs)) → treat as similarity = 1
        }
    }
}
```

This runs before the `originalFirst` threshold check and before inversions.

---

## Phase 4 — Implement `changeFromFirst` with degree-aware alteration logic

**Goal:** Replace the `±1 semitone` heuristic in `computeOmitsAndAlterations` with proper altered-chord detection.

**Current bug:** The code treats any note 1 semitone from an expected interval as an "alteration" with no regard for which degree it is.

**Correct approach:**

1. Build a `DEGREE_NAMES` map: `0→'1', 2→'2', 3→'b3', 4→'3', 5→'4', 6→'b5/#4', 7→'5', 8→'b6/#5', 9→'6', 10→'b7', 11→'7'` — this is the same `INTERVAL` dict from `database.py`.
2. For each expected interval `e` that has no exact match in actual:
    - Check if `e-1` is present → label it `b{degree}` (flattened)
    - Check if `e+1` is present → label it `#{degree}` (sharpened)
    - Otherwise → omit
3. The `changeFromFirst` flag gates whether this altered-chord detection runs _before_ the inversion search (true) or not at all (false). When `changeFromFirst=true`, detect altered chords on the original-order result and if the score exceeds `originalFirstRatio`, return it with the alteration labels rather than falling through to inversions.

---

## Phase 5 — Rework polychord splitting to match documented rules

**Goal:** Split logic must match the exact rules documented:

| Input length | Split rule                                                 |
| ------------ | ---------------------------------------------------------- |
| < 4          | No polychord; fall through to `whole_detect`               |
| 4–5          | Lower = `[note[0]]` (single bass note), Upper = `note[1:]` |
| ≥ 6          | Lower = first `floor(n/2)` notes, Upper = remaining notes  |

**Current bug:** The code iterates all splits `splitAt=2..n-2`, which is both wrong (wrong splits) and slow.

Fix `tryPolychord`:

```typescript
const lower = n < 6 ? deduplicated.slice(0, 1) : deduplicated.slice(0, Math.floor(n / 2));
const upper = n < 6 ? deduplicated.slice(1) : deduplicated.slice(Math.floor(n / 2));
```

Then detect each half with `polyChordFirst: false` and return `"upperChordName/lowerChordName"` string.

---

## Phase 6 — Fix similarity to use the same normalized interval representation as exact detection

**Goal:** Similarity candidates must be compared against the same `standardize()`-compressed intervals that exact detection uses, not raw semitone offsets.

**Current bug:** The similarity loop calls `standardize(deduplicated, rootMidi)` and compares against `entry.intervals`, but `entry.intervals` are root-relative compressed intervals (max 11), while `standardize()` may return intervals > 11 for wide voicings.

Fix: before similarity comparison, also compress the actual intervals to `% 12` then sort — same as what `intervalKey` does for the database keys. The similarity should be computed on these compressed, sorted pitch-class-relative intervals, not the raw ascending semitone distances.

---

## Phase 7 — Return formatted chord name strings

**Goal:** Add a `formatResult(result: MusicpyChordResult): string` export that produces musicpy-style strings.

Format rules:

- Root position, no omits/alterations: `"Cmaj7"`
- With bass note: `"Am7/G"` (slash notation)
- With omits: `"Cmaj9(omit 3)"` — degree number when `showDegree=true`, note name otherwise
- With alterations: `"C7#9"`, `"C7b5#9"`
- Polychord: `"Em/C"` (upper/lower)

The chord symbol (short form) comes from a `CHORD_SYMBOL` lookup alongside `CHORD_TYPES` — e.g. `"major seventh" → "maj7"`, `"minor" → "m"`. This mapping needs to be added to `musicpy-chord-database.ts`.

The `MusicpyChordResult` struct stays as-is (structured data for consumers); `formatResult` is the string serialiser.

---

## Phase 8 — Test suite against real `musicpy.alg.detect()` outputs

**Goal:** One test file (`musicpy-detect.test.ts`) with golden-output cases verified against actual Python musicpy.

Test cases to cover:

| Category          | Input notes    | Expected output   |
| ----------------- | -------------- | ----------------- |
| Root position     | C E G          | `"C"`             |
| Root position 7th | A C E G        | `"Am7"`           |
| First inversion   | E G C          | `"C/E"`           |
| Second inversion  | G C E          | `"C/G"`           |
| Repeated octaves  | C4 E4 G4 C5    | `"C"`             |
| Omission          | C G B D        | `"Cmaj9(omit 3)"` |
| Altered (#9)      | C E G Bb D#    | `"C7#9"`          |
| Altered (b5)      | C E Gb Bb      | `"C7b5"`          |
| Open voicing      | C G E (spread) | `"C"` (voicing)   |
| Polychord         | E G B + C E G  | `"Em/C"`          |

Each test calls `formatResult(detectMusicpy([...midiNotes]))` and asserts against the expected string.

---

**Suggested order:** Phases 1 → 2 → 6 → 4 → 3 → 5 → 7 → 8. Phase 6 must precede Phase 4 because the similarity fix determines what "alteration" means. Phase 7 (formatting) must precede Phase 8 (tests) since tests assert on the string form. Want me to start with Phase 1?

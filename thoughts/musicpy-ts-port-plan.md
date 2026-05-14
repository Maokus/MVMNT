# Musicpy Chord Detection — TypeScript Port Plan

Port goal: replace the current limited interval-table lookup in `chord-estimator.ts` with
musicpy's full detection algorithm (inversions, omissions, alterations, polychords,
similarity fallback), then surface the richer output in `chord-estimate-display.ts`.

Nothing from musicpy outside chord detection is needed (no MIDI I/O, no structures.py,
no playback). The port is purely the database + algorithm layers.

---

## Phase 1 — Port the chord type database

**Files produced:**

- `src/core/midi/music-theory/musicpy-chord-database.ts`

### What to port from `database.py`

#### 1a. Interval semitone constants

The algorithm works entirely in semitone integers. Define named constants:

```typescript
// Just the intervals needed by chord types in detectTypes
const m2 = 1,
    M2 = 2,
    m3 = 3,
    M3 = 4,
    P4 = 5,
    A4 = 6,
    d5 = 6,
    P5 = 7,
    A5 = 8,
    m6 = 8,
    M6 = 9,
    m7 = 10,
    M7 = 11,
    P8 = 12,
    m9 = 13,
    M9 = 14,
    A9 = 15,
    m10 = 15,
    m11 = 16,
    P11 = 17,
    A11 = 18,
    P12 = 19,
    m13 = 20,
    M13 = 21;
```

#### 1b. Chord type table (`chordTypes` → `CHORD_TYPE_INTERVALS`)

Map every alias tuple to a sorted semitone array. This is the authoritative set of ~75
chord types. Store as:

```typescript
type ChordTypeEntry = {
  name: string;           // canonical name, e.g. "major"
  aliases: string[];      // e.g. ["M", "maj", ""]
  intervals: number[];    // sorted semitones above root, e.g. [4, 7]
};
const CHORD_TYPES: ChordTypeEntry[] = [ ... ];
```

Key entries to include (derived from `database.py chordTypes`):

| Canonical name          | Aliases    | Intervals                             |
| ----------------------- | ---------- | ------------------------------------- |
| major                   | M, maj, "" | [4, 7]                                |
| minor                   | m, min     | [3, 7]                                |
| diminished              | dim, o     | [3, 6]                                |
| augmented               | aug, +     | [4, 8]                                |
| dominant seventh        | 7, dom7    | [4, 7, 10]                            |
| major seventh           | maj7, M7   | [4, 7, 11]                            |
| minor seventh           | m7, min7   | [3, 7, 10]                            |
| half-diminished seventh | m7b5, ø    | [3, 6, 10]                            |
| diminished seventh      | dim7, o7   | [3, 6, 9]                             |
| minor major seventh     | mM7        | [3, 7, 11]                            |
| augmented major seventh | augM7      | [4, 8, 11]                            |
| augmented seventh       | aug7       | [4, 8, 10]                            |
| dominant ninth          | 9          | [4, 7, 10, 14]                        |
| major ninth             | maj9       | [4, 7, 11, 14]                        |
| minor ninth             | m9         | [3, 7, 10, 14]                        |
| dominant eleventh       | 11         | [4, 7, 10, 14, 17]                    |
| major eleventh          | maj11      | [4, 7, 11, 14, 17]                    |
| minor eleventh          | m11        | [3, 7, 10, 14, 17]                    |
| dominant thirteenth     | 13         | [4, 7, 10, 14, 17, 21]                |
| major thirteenth        | maj13      | [4, 7, 11, 14, 17, 21]                |
| minor thirteenth        | m13        | [3, 7, 10, 14, 17, 21]                |
| sus2                    | sus2       | [2, 7]                                |
| sus4                    | sus4       | [5, 7]                                |
| dominant seventh sus4   | 7sus4      | [5, 7, 10]                            |
| add9                    | add9, add2 | [4, 7, 14]                            |
| minor add9              | madd9      | [3, 7, 14]                            |
| 6                       | 6, maj6    | [4, 7, 9]                             |
| minor 6                 | m6         | [3, 7, 9]                             |
| 6/9                     | 6/9        | [4, 7, 9, 14]                         |
| ...                     |            | continue for all ~75 from database.py |

#### 1c. Reverse lookup map (`detectTypes` → `DETECT_MAP`)

Pre-build a `Map<string, string>` keyed by `intervals.join(',')` → canonical chord name.
This is what the current hard-coded `INTERVAL_DETECT_MAP` in `chord-estimator.ts` is a
truncated version of. The new map covers all ~75 types.

```typescript
export const DETECT_MAP = new Map<string, string>();
for (const entry of CHORD_TYPES) {
    DETECT_MAP.set(entry.intervals.join(','), entry.name);
}
```

#### 1d. Degree matching tables

These are needed by the similarity fallback and omission detection:

```typescript
// semitone → degree label (for display: "3", "5", "b7", "#11", etc.)
export const SEMITONE_TO_DEGREE: Record<number, string> = {
    1: 'b2',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: '#4',
    7: '5',
    8: '#5',
    9: '6',
    10: 'b7',
    11: '7',
    12: '8',
    13: 'b9',
    14: '9',
    15: '#9',
    17: '11',
    18: '#11',
    19: 'b13',
    21: '13',
};
```

**Acceptance criterion:** All entries from `database.py chordTypes` are present and
`DETECT_MAP.get('4,7')` returns `'major'`, `DETECT_MAP.get('3,7,10')` returns
`'minor seventh'`, etc.

---

## Phase 2 — Pure utility functions (chord normalisation)

**Files produced:**

- `src/core/midi/music-theory/chord-normalise.ts`

These are the preprocessing steps the detection algorithm applies before matching.
They are pure functions operating on `number[]` (arrays of pitch classes or MIDI notes).

### 2a. `deduplicatePitchClasses(midiNotes: number[]): number[]`

Remove notes with identical pitch class (mod 12), keeping the lowest MIDI note for each.
This already exists partially in `chord-estimator.ts:detectChordFromNotes` — extract
into a shared util.

### 2b. `standardize(pcs: number[], root: number): number[]`

The musicpy `chord.standardize()` and `chord.inoctave()` combined:

1. Remove exact duplicates (same pitch class).
2. Transpose so root is 0.
3. Move notes up or down in semitones until all intervals from root are in [0, 15].
   This "inoctave" compression prevents octave-spread chords from defeating lookup.
4. Sort ascending.
5. Return as sorted interval array (intervals above root, not absolute pitches).

### 2c. `allInversions(intervals: number[]): number[][]`

Given a sorted interval array for a chord, return all inversions as interval arrays.
Inversion: cycle the lowest note up an octave, re-normalise relative to new root.

```typescript
// [3, 7] (Cm) → [[3, 9], [5, 9]] (first inv, second inv, intervals from new root)
```

### 2d. `allVoicings(intervals: number[]): number[][]`

Return all permutations of a ≤6-note interval set (only called when `whole_detect` is
true — guarded to avoid combinatorial explosion on >6 notes).

**Acceptance criterion:** Unit tests covering octave-spread chords compressing correctly,
inversions cycling properly, known deduplication cases.

---

## Phase 3 — Port the full detection algorithm

**Files produced:**

- `src/core/midi/music-theory/musicpy-detect.ts`

This is the main deliverable. Port `detect()` from `algorithms.py` as a pure TypeScript
function.

### 3a. Result type

```typescript
export type MusicpyChordResult = {
    root: number; // pitch class 0-11
    chordType: string; // canonical name e.g. "minor seventh"
    inversion: number; // 0 = root position, 1 = first inv, etc.
    bassNote: number | null; // pitch class of bass note if inversion, else null
    omits: string[]; // e.g. ["5"], ["3"]
    alterations: string[]; // e.g. ["b5", "#9"]
    isPolychord: boolean;
    upperChord: MusicpyChordResult | null; // for polychords
    confidence: number; // 0-1, 1.0 for exact match, lower for similarity fallback
};
```

### 3b. Step-by-step algorithm (mirrors `detect()` in algorithms.py)

```
function detectMusicpy(midiNotes: number[], options: DetectOptions): MusicpyChordResult | null

1. SPECIAL CASES
   - 0 notes → null
   - 1 note  → single-note result (no chord type)
   - 2 notes → interval name (b2, 2, m3, M3, P4, tritone, P5, m6, M6, m7, M7, P8)

2. DEDUPLICATE + IDENTIFY BASS
   bass = lowest MIDI note → bassPC = bass % 12
   pcs = deduplicatePitchClasses(midiNotes)  // keeps lowest MIDI note per PC
   Sort pcs ascending by MIDI pitch.

3. FOR EACH ROOT CANDIDATE (try all n pitch classes as potential root)
   For root candidate r in pcs:
     intervals = standardize(pcs, r)   // sorted intervals above r, inoctave-compressed
     key = intervals.join(',')
     if DETECT_MAP.has(key):
       record exact hit: { root: r, chordType: DETECT_MAP.get(key), inversion: 0, ... }

   If any exact hits found:
     if options.preferBassRoot && bassPC is among roots of exact hits → prefer that
     else prefer the first exact hit
     → return result with confidence 1.0

4. INVERSION SEARCH
   For root candidate r:
     For each inversion index i of pcs:
       reorder pcs to treat pcs[i] as lowest note
       intervals = standardize(rearranged, r)
       if DETECT_MAP.has(key):
         record as inverted hit with inversion = i

   If inversion hits found:
     score by: prefer bass-root match, else first hit
     → return with confidence 0.95

5. SIMILARITY FALLBACK (mirrors find_similarity())
   For each CHORD_TYPE entry C:
     score = sequenceSimilarity(intervals_from_any_root, C.intervals)
     if score ≥ similarity_threshold (0.6 default):
       push candidate: { chordType: C, root: bestRoot, score }

   Among candidates:
     check for omissions: which of C.intervals are missing from actual notes
     check for alterations: which actual intervals differ from C.intervals by 1 semitone
     prefer candidates where omitted/altered note count is minimised
   → return best candidate with confidence = similarity_score

6. POLYCHORD SPLIT (only if options.polyChordFirst or previous steps failed)
   If len(pcs) >= 5:
     try splitting pcs into two groups of 2-3 notes each
     detect each group recursively
     if both halves resolve cleanly → return polychord result
   → return with confidence 0.7

7. FAILURE
   return null
```

### 3c. `sequenceSimilarity(a: number[], b: number[]): number`

Port the Python `SequenceMatcher` logic used by `find_similarity()`. Since the inputs are
short sorted integer arrays, a simple matching blocks ratio is sufficient:

```
matches = count of elements in intersection(a, b)
similarity = 2 * matches / (len(a) + len(b))
```

This matches the Python `SequenceMatcher(None, a, b).ratio()` behaviour for these inputs.

### 3d. Options type

```typescript
export type DetectOptions = {
    preferBassRoot?: boolean; // default true
    similarityThreshold?: number; // default 0.6
    wholeDetect?: boolean; // try all voicing permutations, default false (expensive)
    polyChordFirst?: boolean; // default false
    originalFirst?: boolean; // return root-pos result if similarity ≥ threshold
    changeFromFirst?: boolean; // prefer alteration chords
};
```

**Acceptance criterion:** Manual test cases —

- `[60, 64, 67]` (C4, E4, G4) → root=0, chordType='major', inversion=0
- `[64, 67, 72]` (E4, G4, C5) → root=0, chordType='major', inversion=1, bassNote=4
- `[60, 63, 67, 70]` (Cm7) → root=0, chordType='minor seventh', inversion=0
- `[60, 65, 69]` (C, F, A — Fmaj/C) → root=5, inversion=2 or polychord
- `[60, 63, 66]` with omit 5 handled gracefully

---

## Phase 4 — Adapter: bridge new result to existing `EstimatedChord`

**Files modified:**

- `src/core/midi/music-theory/chord-estimator.ts`

The existing public API (`EstimatedChord`, `estimateChordForWindow`) must not break.
Add a new export alongside the existing functions:

```typescript
export function detectChordMusicpy(notes: ActiveNote[], options?: DetectOptions): EstimatedChord | undefined;
```

This function:

1. Calls `deduplicatePitchClasses` then `detectMusicpy`.
2. Maps `MusicpyChordResult` → `EstimatedChord` for display element compatibility:
    - `root` = result.root
    - `quality` = mapChordTypeToQuality(result.chordType) (best-effort for the 11 existing qualities)
    - `bassPc` = result.bassNote
    - `confidence` = result.confidence
3. Passes omits/alterations in a new optional `label` field for richer display.

Also expose the raw `MusicpyChordResult` as a parallel return value for callers that want
the full detail.

**Notes on quality mapping:**
The existing `ChordQuality` union has 11 values. Most musicpy chord types map cleanly
(minor seventh → min7, diminished → dim, etc.). Extended chords (9th, 11th, 13th) can
map to the nearest existing quality or a new 'ext' quality can be added. Decide during
implementation — do not expand the union preemptively.

---

## Phase 5 — Wire into `chord-estimate-display.ts`

**Files modified:**

- `src/core/scene/elements/midi-displays/chord-estimate-display.ts`

### 5a. Add a detection method prop

Add to the estimation prop group:

```typescript
detectionMethod: prop.select('musicpy', ['musicpy', 'template-match', 'simple-interval'])
    .label('Detection method')
    .description(
        'musicpy: full algorithm with inversions/omissions; template-match: Pardo-Birmingham energy; simple-interval: fast exact lookup'
    );
```

### 5b. Route to new detector

In the render/estimation block, switch on `detectionMethod`:

```typescript
const detected =
    method === 'musicpy'
        ? detectChordMusicpy(activeNotes, detectOpts)
        : method === 'template-match'
          ? estimateChordPB(chroma, opts)
          : /* simple-interval */ detectChordFromNotes(activeNotes, opts);
```

### 5c. Richer label rendering

When method is 'musicpy' and `MusicpyChordResult` is available:

- **Root position:** "Cmaj7"
- **Inversion:** "Cmaj7/E" (slash notation, bass note from inversion)
- **Omission:** "Cmaj7(omit 5)"
- **Alteration:** "C7(b5)"
- **Polychord:** "Em/Cmaj7" (upper over lower)

The existing label formatter already handles slash notation — extend it to accept the
omit/alteration suffix strings from `MusicpyChordResult`.

### 5d. Update presets

Add a "Musicpy Full" preset using `detectionMethod: 'musicpy'` with:

- `holdTime: 180`
- `wholeDetect: false`
- `polyChordFirst: false`

---

## Phase 6 — Tests and cleanup

**Files produced:**

- `src/core/midi/music-theory/__tests__/musicpy-chord-database.test.ts`
- `src/core/midi/music-theory/__tests__/musicpy-detect.test.ts`

### 6a. Database tests

- All ~75 chord types present in `CHORD_TYPES`
- `DETECT_MAP` round-trips: every entry's intervals string resolves back to its name
- No duplicate interval strings (would be a data entry error)

### 6b. Detection algorithm tests

Parametrised table of (midiNotes, expectedRoot, expectedType, expectedInversion):

| Input                    | Expected                        |
| ------------------------ | ------------------------------- |
| C E G                    | C major, inv 0                  |
| E G C                    | C major, inv 1                  |
| G C E                    | C major, inv 2                  |
| C Eb G                   | C minor, inv 0                  |
| C E G B                  | C maj7, inv 0                   |
| C Eb G Bb                | C m7, inv 0                     |
| C Eb Gb Bb               | C m7b5, inv 0                   |
| C Eb Gb A                | C dim7, inv 0                   |
| D F A C                  | D m7, inv 0                     |
| C D G                    | C sus2, inv 0                   |
| C F G                    | C sus4, inv 0                   |
| C E G D                  | C add9, inv 0                   |
| C E G A                  | C6, inv 0                       |
| (omit 5) C E Bb          | C7(omit5) — similarity fallback |
| (polychord) E G# B D F A | Em7 / D9 polychord              |

### 6c. Run full typecheck

```bash
npx tsc --noEmit
```

Zero errors before marking complete.

---

## Implementation order and dependencies

```
Phase 1  ──► Phase 2  ──► Phase 3  ──► Phase 4  ──► Phase 5
database     normalize     detect       adapter       display
(standalone) (uses 1)      (uses 1+2)   (uses 3)      (uses 4)
                                                        ▲
                                          Phase 6 tests all layers
```

Phases 1–3 are entirely new files with no changes to existing code — safe to develop and
test in isolation. Phase 4 adds exports to `chord-estimator.ts` without removing any.
Phase 5 is the only change to the display element.

---

## Known risks and decisions deferred to implementation

1. **`sequenceSimilarity` fidelity** — the Python `SequenceMatcher` uses longest common
   subsequence which gives slightly different ratios than intersection-over-union for
   non-sorted inputs. Test against known Python outputs and adjust the threshold if needed.

2. **`inoctave` compression edge cases** — musicpy's compression loop has subtle behaviour
   for very spread voicings (>2 octaves). The Python source is the reference; port it
   literally and add regression tests for known inputs.

3. **Performance** — `wholeDetect` permutation search is O(n!) and only safe for ≤5 notes.
   Gate it with a note-count check and default it off.

4. **ChordQuality union expansion** — if extended chords (9, 11, 13 etc.) need their own
   quality values, expand the union in Phase 4 and update the drift-prevention
   `_verifyCapabilityExports` map if chord quality is part of any SDK surface.

5. **Display element temporal smoothing** — the existing smoothing logic compares
   `EstimatedChord.confidence`. The musicpy path returns 1.0 for exact matches and lower
   for similarity fallbacks, which should integrate cleanly. Verify the hold-time
   behaviour with polychord results (which carry lower confidence).

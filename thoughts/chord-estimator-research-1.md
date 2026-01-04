# Chord Estimator Research 1

Feedback highlighted that the existing chord estimator feels inaccurate and hard to trust. I reviewed the element UI, the `computeChromaFromNotes` pipeline, and the `estimateChordPB` heuristics to pinpoint where perception diverges from the actual harmony. Below are the main friction points and concrete improvement ideas.

## 1. Static, ultra-short analysis window
- The element defaults to a 0.1 s window and clamps values to a minimum of 0.05 s, always centered around the current frame ([src/core/scene/elements/midi-displays/chord-estimate-display.ts#L87-L96](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L87-L96), [src/core/scene/elements/midi-displays/chord-estimate-display.ts#L353-L355](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L353-L355)).
- Because the window is symmetric around `targetTime`, the algorithm “looks ahead” into notes that the audience has not heard yet when the playhead is near the start of a chord, contributing to labels that feel premature.

**Improvements**
1. Allow asymmetric windows (e.g., 80% past / 20% future) to bias detection toward already-audible notes.

## 2. Chroma normalization removes intensity & register cues
- `computeChromaFromNotes` accumulates overlap × velocity weights but normalizes the chroma so the total energy always sums to 1.0 ([src/core/midi/music-theory/chord-estimator.ts#L20-L43](src/core/midi/music-theory/chord-estimator.ts#L20-L43)).
- Normalization discards absolute energy and dynamic contrast: a ghost note transient exerts the same influence as a sustained pad, and quiet pickup notes can flip the detected root as soon as they enter the window.
- Bass emphasis is limited to selecting the single lowest MIDI note in the window; sustained bass notes lose influence if the upper structure keeps changing, which feels wrong musically.

**Improvements**
1. Keep both normalized chroma and absolute energy so low-energy windows can be down-weighted or labeled as `N.C.` when confidence is low.
2. Apply register-aware weights (e.g., emphasize 3rd/7th around middle C, treat bass register separately) to stabilize the perceived quality.
3. Use exponential decay within the window so older attacks contribute less than sustained overlaps, aligning with human perception of chord changes.

## 3. Template coverage & penalties are oversimplified
- The estimator only checks nine hard-coded templates (maj, min, dim, aug, three 7ths, m7♭5, dim7) with binary tone masks and uniform penalties for all “non-tones” ([src/core/midi/music-theory/chord-estimator.ts#L48-L90](src/core/midi/music-theory/chord-estimator.ts#L48-L90)).
- No support exists for sus, add9, 6/9, altered dominants, quartal voicings, or modal chords, so those voicings get forced into the closest triad/7th and feel incorrect. A lydian pad often appears as plain `Cmaj` even though the #11 is dominant in the chroma.
- The `nonTonePenalty` and `toneWeight` constants are global, meaning dense voicings with tensions are punished as “wrong” instead of treated as valid extensions.

**Improvements**
1. Expand templates (or learn them) to include sus, add, altered, and quartal sets, ideally with probabilistic weights rather than binary masks.
2. Replace the single `nonTonePenalty` with tone-specific penalties (e.g., treat #11 differently from ♭9) or adopt cosine similarity with learned profiles.
3. Surface presets that map to musical contexts (“Pop triads”, “Jazz tensions”, “Cluster-friendly”) so users can pick behaviour without toggling individual qualities blindly.

## 4. Bass and inversion logic hinges on one note
- The detector picks the lowest MIDI note overlapping the window as `bassPc` and simply adds a fixed bonus if it matches the root or any chord tone ([src/core/midi/music-theory/chord-estimator.ts#L27-L36](src/core/midi/music-theory/chord-estimator.ts#L27-L36), [src/core/midi/music-theory/chord-estimator.ts#L78-L97](src/core/midi/music-theory/chord-estimator.ts#L78-L97)).
- Any sustained pedal tone, even from another track sharing the timeline window, can lock the inversion and root; alternating bass notes in walking lines flip the label every 0.1 s.
- The UI advertises a `Prefer Root in Bass` toggle and displays inversions, but the logic never checks whether the bass note belongs to the current template—if it does not, the slash notation is still forced, which reads as “wrong slash chord” to users.

**Improvements**
1. Track per-note durations inside the window and use majority vote or Hidden Markov Model smoothing for bass candidates instead of a single lowest-note snapshot.
2. When `preferBassRoot` is off, treat bass evidence as soft prior instead of forcing 0.15 score jumps; show inversion only if the bass belongs to the winning chord mask.
3. Allow selecting a dedicated bass track or channel so drum/pedal noises don’t contaminate the MIDI harmony track.

## 5. Temporal smoothing defaults are effectively disabled
- Although the schema exposes `smoothingMs`, the runtime default is 1 ms, and smoothing only kicks in when the next frame is within that threshold and has lower confidence ([src/core/scene/elements/midi-displays/chord-estimate-display.ts#L148-L156](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L148-L156), [src/core/scene/elements/midi-displays/chord-estimate-display.ts#L387-L399](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L387-L399)).
- Typical render cadences (30–60 FPS) mean `dtMs` is ~16–33 ms, so the default never holds a chord; users must discover the advanced preset to get 120–240 ms. Without smoothing, every pickup note instantly renames the chord, which reads as “unstable”.
- Confidence thresholds are asymmetric: the previous chord is only kept if it had >0.2 confidence and the new chord is <100% of the old confidence, so any slightly stronger but still incorrect candidate replaces the display.

**Improvements**
1. Raise the default to ~150 ms and expose a labeled “Hold last chord for X ms” slider in the basic group.
2. Replace the binary keep/replace logic with a weighted moving average of chord probabilities or a Viterbi pass across recent windows for musically plausible sequences.
3. Display the current confidence so users know when the algorithm is uncertain, encouraging them to adjust smoothing before assuming the harmony is wrong.

## 6. Visualization controls don’t match the rendered output
- The Typography group exposes `chromaPrecision`, but the runtime never reads it—`showChroma` just draws 12 rectangles with `rgba(255,255,255,chroma[i])` alpha ([src/core/scene/elements/midi-displays/chord-estimate-display.ts#L287-L295](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L287-L295), [src/core/scene/elements/midi-displays/chord-estimate-display.ts#L444-L462](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L444-L462)). Users tweak the slider expecting numeric readouts or rounding, but nothing changes.
- Active notes are capped at eight entries and silently truncated with an ellipsis ([src/core/scene/elements/midi-displays/chord-estimate-display.ts#L423-L436](src/core/scene/elements/midi-displays/chord-estimate-display.ts#L423-L436)). Complex voicings therefore hide the very tensions that explain “why” a chord name looks odd, reinforcing the feeling that the detector is wrong.
- Color/opacity scaling is linear with chroma magnitude, so moderate energy (~0.2) is barely visible; there is no legend tying each bar back to pitch-class text, which reduces the diagnostic value of the chart.

**Improvements**
1. Either wire `chromaPrecision` into the display (e.g., tooltip text, numeric table) or remove it to reduce confusion; consider a compact text grid showing rounded chroma bins.
2. Let users scroll or expand the active-note list, or group notes into pitch-class buckets so every note that influenced the decision is visible.
3. Normalize chroma visualization per-frame (max -> 1) or use logarithmic opacity so mid-level contributions remain readable, and label each bar with its pitch class.

---
Addressing these points will make the element feel musically aware: chords will change at human-perceived boundaries, inversions will only appear when justified, and the onscreen diagnostics will finally explain *why* a certain label was chosen.
# Prop System — Remaining Work (May 2026)

This document tracks items from the prop-system improvement plan that are deferred, partially done,
or require a decision before implementation.

---

## Status Overview

| Requirement                                                     | Status                                        |
| --------------------------------------------------------------- | --------------------------------------------- |
| `prop.*` simple — no order/section metadata on individual props | ✓ Done                                        |
| `section.*` helpers                                             | ✓ Done (added this session)                   |
| Canonical group order enforced                                  | ⚠ Convention only — see §1                    |
| `propGroup.*` scoped to true reusable sections                  | ✓ Done                                        |
| `prop.slot.colorOpacity()`                                      | ✓ Done (added this session)                   |
| Named appearance groups: `id`, `label`, `keyPrefix`             | ✓ Done                                        |
| Named border groups: `id`, `label`, `keyPrefix`                 | ✓ Done (added this session)                   |
| Keys not derived from display labels                            | ✓ Done                                        |
| Semantic keys on multi-surface elements                         | ✓ Done                                        |
| `color + opacity`; `colorAlpha` deferred                        | ⚠ Templates still use `colorAlpha` — see §2   |
| Related colors grouped together                                 | ✓ Done (spectrum, waveform, progress-display) |
| Group label audit                                               | ✓ Done for key elements                       |
| Migration fallbacks (`fillColor ?? color`)                      | N/A — no key renames have happened            |
| Theming, palettes, shared enums deferred                        | ✓ Deferred                                    |
| No bloat: not every pattern → full `propGroup`                  | ✓ Done                                        |

---

## §1 — Canonical Section Order: Convention vs Enforcement

**Current state:** `section.*` helpers give canonical ids, but `insertElementGroups` does **not** sort
groups by canonical order. The order in the inspector is exactly the order you pass groups to
`insertElementGroups`.

**Canonical order:** `Source → Content → Layout → Appearance → Typography → Border → Container → Effects → Advanced`

**Why enforcement was not added:**  
Sorting in `insertElementGroups` would silently reorder existing elements that put custom groups
(e.g. `id: 'waveform'`, `id: 'shapeType'`) before canonical groups. Those elements rely on their
hand-written order, and auto-sorting would break their inspector UX without warning.

**What's needed to enforce it:**  
If enforcement is wanted in the future:

1. Update `insertElementGroups` to sort `pluginGroups` by canonical id before inserting.
2. Define the canonical order index in `plugin-sdk-prop-factories.ts` or alongside `section.*`:
    ```ts
    const CANONICAL_SECTION_ORDER = [
        'audioSource',
        'midiSource', // Source
        'content', // Content
        'layout', // Layout
        'appearance', // Appearance  (appearance_* after, ~4.5)
        'typography', // Typography
        'border', // Border      (border_* after, ~5.5)
        'container', // Container
        'effects', // Effects
        'shadow', // Shadow (part of Effects)
    ];
    ```
3. Any group id not in the list goes to the end, preserving relative order among unknowns.
4. Audit all elements to confirm the new order matches intent.

**Recommended approach:** Add an opt-in `sortByCanonicalOrder: true` flag to `insertElementGroups`
rather than making it the default, so existing elements are unaffected until explicitly updated.

---

## §2 — Templates Still Use `colorAlpha`

**Files (not default elements — these are ok to leave for now):**

- `src/core/scene/elements/_templates/minimal.ts` — `prop.colorAlpha('color', ...)`
- `src/core/scene/elements/_templates/basic-shape.ts` — `prop.colorAlpha('shapeColor', ...)`
- `src/core/scene/elements/_templates/text-display.ts` — `prop.colorAlpha('textColor', ...)` + `prop.colorAlpha('backgroundColor', ...)`
- `src/core/scene/elements/_templates/audio-reactive.ts` — `prop.colorAlpha('shapeColor', ...)`
- `src/core/scene/elements/_templates/midi-notes.ts` — `prop.colorAlpha('noteColor', ...)`
- `src/core/scene/elements/_examples/beat-rings/beat-rings.ts` — `prop.colorAlpha('ringColor', ...)`
- `src/core/scene/elements/_examples/falling-notes/falling-notes.ts` — `prop.colorAlpha('noteColor', ...)`, `prop.colorAlpha('nowLineColor', ...)`

**Why this matters:**  
Templates are the first thing a plugin author sees when creating a new element. If they show
`colorAlpha`, new elements will use `colorAlpha` instead of the canonical `color + opacity` split.
This undermines convention consistency over time.

**Recommended fix when ready:**  
Update all `_templates/` to use `prop.color()` + `prop.range()` (for opacity) or `prop.slot.colorOpacity()`.
Update `_examples/` for consistency, though they're illustrative rather than prescriptive.

**Blocker:** The plan defers `colorAlpha` promotion until the UI picker robustly supports alpha.
The inverse — removing `colorAlpha` from templates — can be done independently of the UI work and
does not require a new picker, since templates use `colorAlpha` for single-value color inputs (not
independent animation of color vs opacity). Just swap to `prop.slot.colorOpacity()`.

**Effort:** Low — each template has 1–2 `colorAlpha` calls. Straightforward substitution.

---

## §3 — Elements Not Yet Migrated to `section.*`

No existing element currently uses `section.*` helpers — they were just added. The existing elements
use inline `PropertyGroup` objects or `propGroup.*` factories, both of which remain valid.

Migration is **not required**: `section.*` is an additive API, not a mandate. Elements only need to
adopt sections if:

- They have custom groups that belong to a canonical slot (e.g., a 'Content' section that should
  sort correctly relative to Appearance/Typography).
- A future `sortByCanonicalOrder` flag is added to `insertElementGroups` (see §1).

The elements that would benefit most from `section.*` adoption are those with multiple custom groups
that are conceptually Content vs Appearance vs Advanced (e.g. `ProgressDisplayElement`,
`BasicShapesElement`, `AudioWaveformElement`).

---

## §4 — `colorSlotProps` vs `prop.slot.colorOpacity`

Both are exported. `prop.slot.colorOpacity` is the canonical, spec-aligned API. `colorSlotProps`
is a backwards-compatible alias (delegates to `prop.slot.colorOpacity` internally).

`ProgressDisplayElement` currently uses `colorSlotProps`. No action needed — either name works.
For new code, prefer `prop.slot.colorOpacity`.

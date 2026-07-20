# Element Perspective Property UI Plan

**Status:** Proposed design; implementation intentionally deferred.

**Feature dependency:** `elementPerspectiveWarp` remains disabled by default until this plan is accepted and its product UI is implemented.

## Goals and constraints

Perspective authoring should feel like a distinct corner-pin operation, not another set of fields inside the already dense affine transform group. The generic Position, Rotation & Scale group must remain unchanged. Enabling perspective should be discoverable, Warp Edit mode must be unmistakable, and users need a safe route back to the identity shape.

## Recommended product surface

Add a dedicated **Perspective** inspector section immediately after the generic transform group. Its collapsed summary should say `Off`, `Identity`, or `Warped`. The section contains three primary actions: Enable/Disable, Edit on Canvas, and Reset Corners. Reset requires no confirmation because it is undoable. Disabling preserves corner values so re-enabling restores the prior warp; Reset explicitly writes the four identity corners.

`Edit on Canvas` enters a dedicated Warp Edit canvas mode for the selected element. The button becomes `Done`, Escape exits, changing selection exits, and selecting a different tool exits. A concise canvas badge (“Warp Edit · Esc to finish · Ctrl/⌘ disables snapping”) makes the mode and escape route visible without adding a permanent toolbar button. The selection outline uses four labelled corner handles and retains interior dragging for movement.

A dedicated global toolbar button is not recommended initially: perspective is element-specific, gated, and likely less common than move/scale/rotate. A popover alone is too transient for automation controls. A new inspector tab would hide the relationship with the selected element and consume scarce responsive navigation space. The dedicated inspector section plus temporary canvas mode is the smallest coherent surface.

## Numeric editing and automation

Direct manipulation is primary. An expandable **Corner Values** subsection provides numeric X/Y fields for Top Left, Top Right, Bottom Right, and Bottom Left. Values are normalized but not clamped to 0–1; helper text explains that values outside the element are allowed. Fields should use the existing binding control so constants, macros, and keyframes work consistently.

Each coordinate exposes the standard binding menu. The four corner rows should also offer a group automation affordance that creates/selects all eight channels together without inventing a compound binding type. Macro assignment remains per coordinate because macros are scalar today. A later paired-vector macro type should not be introduced solely for this feature.

When automated values are temporarily invalid, the editor retains the authored data, renders the affine fallback, and shows a non-blocking warning in the Perspective section. The warning identifies the current time and broad reason (non-finite, crossed/concave, degenerate, or projective pole). It should offer “Jump to channels” when automation is involved, not silently repair keyframes.

## Accessibility and keyboard behavior

- Handles need persistent TL/TR/BR/BL labels, a high-contrast focus ring, and a target at least 24 CSS pixels wide even if the drawn marker is smaller.
- Tab cycles through the four corners while Warp Edit is active. Arrow keys move the focused corner by 0.01 normalized units; Shift+Arrow uses 0.1 and Alt/Option+Arrow uses 0.001. Each key repeat is one merged undo gesture.
- Enter toggles keyboard drag/commit behavior only if user testing shows it is necessary; plain arrow adjustment is preferable.
- Escape exits Warp Edit without reverting completed changes. A drag cancelled by pointer cancellation keeps its last valid sample, consistent with other transforms.
- Screen-reader announcements should name the corner, normalized X/Y value, snapping result, and invalid-sample rejection.
- Color cannot be the only distinction between perspective and affine handles.

## Invalid-warp feedback

During direct manipulation, invalid samples are rejected and the handle remains at the last valid position. The canvas badge briefly states why. Numeric fields may contain an incomplete editing string locally, but only valid finite commits enter scene state. Imported or automated invalid values are not rewritten; the inspector shows a warning while the renderer uses affine fallback.

## Responsive layout

On wide inspectors, each corner uses one row with X and Y fields. On narrow/mobile layouts, X and Y stack under the corner label and the primary actions wrap into two rows. Canvas mode instructions reduce to an icon plus `Warp` badge, with the full instructions available through an accessible description. The design must not require simultaneous visibility of the inspector and canvas; keyboard exit and the canvas badge remain available when panels are hidden.

## Introduction strategy

1. Keep the feature flag off in normal sessions and enable it for developer testing.
2. Usability-test the dedicated inspector section and temporary mode with identity, strong keystone, and off-canvas corners.
3. Validate keyboard operation and automated invalid-state recovery.
4. Implement the accepted UI without adding perspective rows or conditionals to the generic transform component.
5. Enable the flag for beta sessions, review compositor diagnostics and support feedback, then enable by default.

## Open decisions for review

- Whether the Corner Values subsection starts collapsed (recommended) or remembers its state per user.
- Whether a small perspective icon belongs in the element-list row after the beta period.
- Whether group automation navigation is required for first release or can follow the scalar binding controls.


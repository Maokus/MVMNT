I want you to refactor my keyframe animation system into a hybrid interpolation model inspired by Blender’s internal logic, but with a simpler UX.

Primary goal:
Build a system where each segment between two keyframes has exactly one active interpolation mode:
- constant
- linear
- bezier
- semantic preset modes such as sine, quad, cubic, quart, quint, expo, circ, back, bounce, elastic

Core interaction rule:
- If a segment is in bezier mode, it is evaluated using the keyframe handles.
- If a segment is in any non-bezier semantic mode, the handles are ignored for runtime evaluation.
- Handle data must still be preserved in storage even when a non-bezier mode is active, so switching back to bezier restores the previous curve shape.

Data model requirements:
Implement a clean TypeScript model for:

1. Keyframes
- time
- value
- leftHandle
- rightHandle
- leftHandleType
- rightHandleType

2. Segment interpolation
- mode
- easing direction where applicable
- parameters where applicable, such as:
  - back overshoot
  - elastic amplitude
  - elastic period

Handle types:
Support:
- free
- aligned
- vector
- auto
- auto_clamped

Easing modes:
Support:
- auto
- ease_in
- ease_out
- ease_in_out

Implementation requirements:
1. Define the TypeScript types clearly.
2. Refactor the evaluator so segment evaluation dispatches by interpolation mode:
   - constant => stepped
   - linear => linear interpolation
   - bezier => cubic bezier evaluation using keyframe handles
   - other modes => evaluate using easing functions and segment parameters
3. Separate stored keyframe data from active segment evaluation logic.
4. Preserve backward compatibility where reasonable.
5. Keep the code modular and easy to extend with more interpolation modes later.
6. Add comments explaining the architecture and the interaction between handles and interpolation modes.

Behavior requirements:
- Each keyframe stores outgoing segment interpolation metadata, unless the current architecture strongly prefers storing it on segments.
- Non-bezier interpolation modes must not mutate or delete handle data.
- Switching interpolation mode from bezier to bounce/elastic/etc disables handle-based evaluation for that segment.
- Switching back to bezier reuses the previously stored handles.

UI requirements:
Implement the UI for editing this system as well, but keep it minimal and incremental rather than building a full Blender-style graph editor.

The UI should include:

1. Timeline segment interaction
- Users can click a segment between two keyframes to edit that segment’s interpolation.
- The selected segment should have a clear visual selected state.
- Existing behavior should be preserved where possible.

2. Interpolation picker
- Replace or extend the current easing picker so it edits the new interpolation schema.
- The picker should allow:
  - constant
  - linear
  - bezier
  - semantic presets grouped clearly
- Suggested groups:
  - Basic: constant, linear, bezier
  - Smooth: sine, quad, cubic, quart, quint, expo, circ
  - Dynamic: back, bounce, elastic

3. Easing direction controls
- For modes that support easing direction, show:
  - auto
  - ease in
  - ease out
  - ease in out
- Hide or disable easing direction controls for modes where they do not apply.

4. Parameter controls
- Show parameter controls only when relevant:
  - back => overshoot
  - elastic => amplitude, period
- Use simple numeric inputs or sliders.
- Keep defaults sensible.

5. Handle editing
- Only show bezier handles as active/editable when the selected segment is in bezier mode.
- If the UI already has handle editing, adapt it to respect the interpolation mode.
- If the current UI does not yet support handle editing, implement a minimal version:
  - display left/right handles for selected bezier keyframes
  - allow dragging handles
  - support handle types at least at a basic level
- Do not build a full advanced graph editor unless the codebase already has one.

6. Handle type controls
- Add a simple control for:
  - free
  - aligned
  - vector
  - auto
  - auto_clamped
- This can be a dropdown, segmented control, or context menu.
- Only show it when bezier interpolation is relevant.

7. Mode switching behavior
- Switching from bezier to a semantic mode should preserve handles internally but visually de-emphasize or disable them.
- Switching back to bezier should restore the previous handle-based curve shape.
- The UI should make it clear that only one interpolation mode is active for a segment at a time.

8. Curve preview
- Wherever practical, update the curve preview/timeline rendering so the segment shape reflects the active interpolation mode.
- For non-bezier modes, show an approximate preview of the actual motion curve if possible.
- If exact preview rendering is too invasive initially, implement a clean fallback and explain what remains.

Workflow:
Please do the following:
1. Inspect the current animation/keyframe codebase and identify the relevant files for:
   - data model
   - evaluator/runtime
   - timeline/keyframe UI
   - easing picker / interpolation UI
2. Propose a short implementation plan.
3. Implement the engine/data model/runtime refactor first.
4. Then implement the UI changes in small, clean steps.
5. Show the exact code changes.
6. Explain assumptions, migration decisions, and any compromises.

Important constraints:
- Do not do a giant rewrite.
- Prefer small, composable changes over replacing the whole system.
- Keep existing UX patterns where possible.
- Do not build a full graph editor unless it already mostly exists.
- Focus on a practical, shippable hybrid system.
- If the codebase architecture suggests storing interpolation metadata on segments instead of keyframes, use your judgment, but keep the final system simple and clear.

Deliverables:
- updated types
- updated evaluation/runtime logic
- updated interpolation/easing picker UI
- minimal bezier handle UI integration
- migration/backward compatibility handling
- concise explanation of the new architecture
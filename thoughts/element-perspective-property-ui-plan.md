# Modular Interactive Property Controls Plan

**Status:** Proposed

**Motivation:** Perspective needs coordinated two-axis and point controls, but the inspector must not know what “perspective” means. The same infrastructure should support any future compound editor, such as position pads, gradient stops, crop rectangles, or paired range controls.

## Principles

1. Scene properties remain the canonical runtime, automation, macro, undo, and persistence values. Interactive controls are views over those properties, not new property types.
2. Layout metadata is separate from property definitions. A number remains a number whether it appears as a normal row, in an XY pad, or in both.
3. Controls are selected through a registry of generic capabilities. The property panel must not branch on an element type, group ID, or feature name.
4. A missing or unsupported interactive control falls back to the existing property rows, so schemas remain editable across host and plugin versions.
5. Multi-property gestures use one host-owned transaction API. Individual controls must not reproduce undo, auto-key, macro, or command-merging logic.

## Proposed schema model

Keep `PropertyDefinition[]` unchanged as the source of truth. Add an optional inspector layout to a group as a tree of serializable nodes:

```ts
type PropertyLayoutNode =
    | { kind: 'property'; propertyKey: string }
    | { kind: 'control'; control: string; bindings: Record<string, string>; options?: Record<string, unknown> }
    | { kind: 'section'; id: string; label?: string; collapsed?: boolean; children: PropertyLayoutNode[] }
    | { kind: 'actions'; actions: PropertyActionDefinition[] };
```

`bindings` maps semantic control ports to canonical property keys. For example, an `xy-pad` receives `{ x: 'perspectiveRotationY', y: 'perspectiveRotationX' }`; it never receives a perspective-specific object. A `point-grid` can bind the pivot or vanishing-point pair without knowing which one it edits.

The first built-in controls should be:

- `slider-number`: one numeric property, with optional scale/format adapter.
- `xy-pad`: two numeric properties, axis ranges, inversion, and reset values.
- `point-grid`: two numeric properties plus an optional visual coordinate range.
- `derived-number`: an alternate display/edit mapping for one canonical numeric property, such as strength to camera distance.
- `section`: generic progressive disclosure for Basic and Advanced layouts.

Properties omitted from the layout are appended as ordinary rows in schema order. Repeating a property in an interactive control and a numeric row is allowed when exact entry is useful.

## Control registry

Introduce a `PropertyControlRegistry` at the workspace boundary:

```ts
interface PropertyControlRegistration {
    id: string;
    validate(node: PropertyControlNode, properties: PropertyDefinition[]): ValidationResult;
    component: React.ComponentType<PropertyControlProps>;
}
```

The property panel resolves `node.control` through the registry and renders a generic fallback when resolution or validation fails. Core controls register during workspace bootstrap. Plugin-defined controls should be a later, versioned capability because they execute UI code; plugin schemas can safely use host-provided control IDs first.

The registry avoids a central switch statement and lets controls be developed and tested independently. Registration conflicts, unknown ports, missing property keys, and incompatible property types should produce development diagnostics without making the inspector unusable.

## Host-owned binding controller

Create a controller/hook that turns property keys into control ports. It supplies:

- current evaluated values and canonical authored values;
- property definitions, disabled state, macro assignment, and keyframe state;
- `set(port, value)` and `setMany(values)` for discrete edits;
- `beginGesture()`, `updateGesture(values)`, and `commitGesture(values)` for merged drag undo;
- reset, macro assignment, and keyframe navigation actions using the existing property behavior.

`setMany` and gesture updates dispatch one atomic property patch. Auto-keying is applied to every affected canonical property by the host before the command is dispatched. A control therefore cannot accidentally update X correctly while bypassing automation or undo for Y.

Derived displays use reversible adapters owned by the registered control or a small host adapter registry:

```ts
interface NumericAdapter {
    fromProperty(value: number): number;
    toProperty(displayValue: number): number;
}
```

Camera distance can then be a derived view of `perspectiveStrength`; it does not require a duplicate scene property or migration.

## Perspective composition

Once the generic pieces exist, the Perspective group can declare:

1. The existing enable boolean as a normal property row.
2. A Basic section containing an `xy-pad` bound to the two rotation properties, exact numeric rows for both axes, and a `slider-number` bound to strength.
3. An Advanced section containing the existing pivot-link boolean, a conditionally visible `point-grid` plus exact pivot rows, a canvas-relative `point-grid` plus exact vanishing-point rows, and a `derived-number` camera-distance view bound to strength.
4. A declarative reset action containing a patch of canonical property values.

No perspective component, group discriminator, persistence field, or property-panel conditional is needed.

## Delivery phases

### Phase 1: generic layout and fallback

- Define internal layout node types and validation.
- Add the control registry and generic renderer alongside the current row renderer.
- Implement `property` and `section` nodes.
- Guarantee fallback rendering for absent, invalid, or unknown layout metadata.

### Phase 2: transactional bindings

- Extract current row edit behavior into the host-owned binding controller.
- Add atomic `setMany` and gesture lifecycle support.
- Preserve existing undo merge, auto-key, keyframe, macro, visibility, and disabled-state behavior.
- Make ordinary property rows use the same controller before introducing compound controls.

### Phase 3: reusable controls

- Build accessible `xy-pad`, `point-grid`, `slider-number`, and `derived-number` registrations.
- Support keyboard adjustment, pointer capture, cancellation, exact numeric entry, labels, descriptions, and reset behavior.
- Keep visual ranges separate from canonical property min/max so off-canvas values remain editable.

### Phase 4: adopt and prove reuse

- Express Perspective entirely through layout metadata over its existing properties.
- Apply at least one compound control to a non-perspective group, such as an XY position pad, to prove the API is general.
- Remove any temporary control-specific plumbing only after both uses pass the same integration tests.

### Phase 5: public contract

- Stabilize the serializable subset and expose host-provided control IDs through the plugin SDK.
- Version schema validation and document capability discovery/fallback behavior.
- Consider third-party UI registrations only after security, styling, lifecycle, and compatibility constraints are defined.

## Test gates

- Registry tests cover registration, conflicts, validation, and unknown-control fallback.
- Layout tests prove no element/group identifiers are inspected by the renderer.
- Transaction tests cover multi-property undo/redo, drag merging, cancellation, auto-keying, macros, and keyframe navigation.
- Reuse tests render the same `xy-pad` and `point-grid` with unrelated property names.
- Accessibility tests cover labels, focus order, arrow-key increments, disabled states, and pointer/keyboard parity.
- Persistence tests confirm layout metadata creates no scene fields and needs no scene-schema migration.
- Plugin compatibility tests confirm an older host renders ordinary rows when it does not recognize a newer control ID.

## Completion criteria

The work is complete when Perspective can recover its richer UI by changing declarative layout metadata only, the property panel contains no perspective references, compound gestures behave exactly like ordinary property edits for undo/automation/macros, and a second feature reuses the same controls without modifying the renderer.

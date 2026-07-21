# Declarative property layouts

The element inspector normally renders each `PropertyDefinition` as one scalar
row. A `PropertyGroup` can optionally add `layout` metadata to compose those
same canonical properties into richer, reusable controls. Layout is workspace
UI metadata: it is not stored in scene documents and does not create a new
runtime property or binding type.

This is currently an internal host API. It is intentionally not part of
`@mvmnt/plugin-sdk`; plugins continue to use the stable scalar property schema.

## Layout nodes

`PropertyGroup.layout` is an ordered array of `PropertyLayoutNode` values:

```ts
layout: [
    { kind: 'property', propertyKey: 'warpEnabled' },
    {
        kind: 'section',
        id: 'basic',
        label: 'Basic',
        visibleWhen: [{ key: 'warpEnabled', equals: true }],
        children: [
            {
                kind: 'control',
                control: 'xy-pad',
                bindings: { x: 'perspectiveRotationY', y: 'perspectiveRotationX' },
                options: { label: 'Tilt' },
            },
            { kind: 'property', propertyKey: 'perspectiveRotationX' },
            { kind: 'property', propertyKey: 'perspectiveRotationY' },
        ],
    },
];
```

- `property` renders the ordinary property row, including macro and keyframe
  affordances.
- `control` binds semantic ports to property keys. Controls receive no element-
  or feature-specific data.
- `section` provides nested, locally collapsible disclosure.
- `actions` renders declarative buttons that submit a canonical property patch,
  such as a reset action.

Properties not explicitly represented by a layout remain visible as ordinary
rows in schema order. A property may be deliberately repeated as both a
compound control port and an exact scalar row.

## Built-in controls and fallback

The workspace owns `PropertyControlRegistry`. The initial registrations are
`slider-number`, `xy-pad`, `point-grid`, and `derived-number`. Numeric controls
validate that every required binding exists in the group and is a `number` or
`range` property before rendering.

Unknown controls, missing ports, and incompatible bindings log a development
warning and render their bound scalar rows instead. This keeps schemas editable
when a layout is incomplete or a control has not been registered. Inspector
search always uses ordinary matching rows rather than layout controls.

## Editing semantics

All layout controls submit canonical property patches through the element
property panel. The panel updates the visible values together and preserves the
existing macro-disabled state.

With auto-key enabled, every automatable property in a compound patch is
enabled or keyed together. Multi-property automation uses the scene command
gateway's `batch` command, so it is one telemetry event and one undoable
operation. Pointer-range gestures provide a merge session so intermediate drag
updates merge like existing numeric drags.

Controls must never write directly to the scene store, invent a compound scene
value, or implement their own undo/automation logic.

## Adding a host control

Register a `PropertyControlRegistration` in
`PropertyControlRegistry.tsx`. Its `validate` function must reject missing or
incompatible bindings and its component must use only the supplied semantic
bindings, canonical values, disabled-state query, and `setMany` callback.

Use serializable `options` for labels and display ranges. Do not place React
components, callbacks, or element-specific concepts in schema layout metadata.
Before adopting a new control, add registry/fallback coverage and reuse it from
at least two unrelated property pairs where practical.

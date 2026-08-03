# Declarative property layouts

The element inspector normally renders each `PropertyDefinition` as one scalar
row. A `PropertyGroup` can optionally add `layout` metadata to compose those
same canonical properties into richer, reusable controls. Layout is workspace
UI metadata: it is not stored in scene documents and does not create a new
runtime property or binding type.

This is public, serializable SDK 2 inspector metadata. Plugin schemas may use
the same layout nodes through `ElementPropertyGroup.layout`; layouts never
become scene data or runtime property values.

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

`visibleWhen` works on layout controls and sections, and is also respected for
properties rendered through a layout. A control is hidden when any of its bound
properties is hidden, keeping compound controls and their scalar rows aligned.

Properties not explicitly represented by a layout remain visible as ordinary
rows in schema order. A property may be deliberately repeated as both a
compound control port and an exact scalar row.

## Built-in controls and fallback

The workspace owns `PropertyControlRegistry`. The initial registrations are
`slider`, `xy-pad`, `point-grid`, `anchor-grid`, and `derived-number`. Numeric controls
validate that every required binding exists in the group and is a `number`
property before rendering. A slider is paired with its ordinary property row to
retain macro, keyframe, drag, and precise numeric-entry affordances:

```ts
layout: [
    {
        kind: 'control',
        control: 'slider',
        bindings: { value: 'opacity' },
        options: { min: 0, max: 1, step: 0.01 },
    },
    { kind: 'property', propertyKey: 'opacity' },
];
```

Numeric controls can set their display range independently of the underlying
property. `slider` uses `min`, `max`, and `step`; multi-value controls use the
port-prefixed form, such as `xMin`, `xMax`, and `xStep`. Any omitted value
falls back to that bound property's `min`, `max`, or `step` (and then the
control's existing default).

Unknown controls, missing ports, and incompatible bindings log a development
warning and render their bound scalar rows instead. This keeps schemas editable
when a layout is incomplete or a control has not been registered. Inspector
search always uses ordinary matching rows rather than layout controls.

## Editing semantics

All layout controls submit canonical property patches through the shared
property edit coordinator. The panel updates the visible values together and
preserves the existing macro-disabled state. Host-node fields, plugin fields,
canvas transforms, and compound controls therefore share the same auto-key,
binding, gesture merge, batch, and undo rules even though host and plugin values
remain in separate authored stores.

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

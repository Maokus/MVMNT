# Plugin SDK 2 quickstart

This guide takes a new plugin from an empty folder to an element available in MVMNT.
SDK 2 plugins export `definePluginElement()` definitions. They do not subclass `SceneElement`
or import MVMNT application aliases such as `@core/*` or `@state/*`.

## Before you begin

You need Node.js and npm. Start a plugin project and install the published SDK:

```sh
mkdir pulse-plugin
cd pulse-plugin
npm init -y
npm install @mvmnt-app/plugin-sdk
npm install --save-dev typescript
```

For unreleased SDK changes from a local MVMNT checkout, build and install the local package instead:

```sh
# In the MVMNT checkout
npm install
npm run build:plugin-sdk

# In an existing plugin project
npm init -y
npm install /absolute/path/to/MVMNT/packages/plugin-sdk
npm install --save-dev typescript
```

Create this layout:

```text
pulse-plugin/
├── package.json
├── tsconfig.json
├── plugin.json
└── pulse.ts
```

Use this `tsconfig.json` for type-checking:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["*.ts"]
}
```

## Create the manifest

`plugin.json` identifies the plugin and maps each scene-element type to its source entry. New
plugins use `^2.0.0`. The capability lists must match the corresponding definition exactly,
including whether each capability is required or optional.

```json
{
  "id": "com.example.pulse",
  "name": "Pulse",
  "version": "1.0.0",
  "apiVersion": "^2.0.0",
  "description": "A small animated pulse element.",
  "elements": [{
    "type": "pulse",
    "entry": "pulse.ts",
    "capabilities": {
      "required": ["timeline.read"],
      "optional": ["audio.features.read"]
    }
  }]
}
```

Use a unique lowercase, hyphenated element type. Plugin IDs conventionally use reverse-domain
notation. The builder rejects duplicate types, private application imports, path traversal, and
capability mismatches before it evaluates plugin code.

## Define the element

Put this in `pulse.ts`:

```ts
import { definePluginElement } from '@mvmnt-app/plugin-sdk/scene';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const pulse = definePluginElement({
    type: 'pulse',
    metadata: {
        name: 'Pulse',
        description: 'A pulsing square',
        category: 'Examples',
    },
    schema: {
        tabs: [{
            id: 'properties',
            label: 'Properties',
            groups: [{
                id: 'appearance',
                label: 'Appearance',
                collapsed: false,
                properties: [
                    { key: 'color', label: 'Color', type: 'colorAlpha', default: '#3B82F6FF' },
                    { key: 'minSize', label: 'Minimum Size', type: 'number', default: 40, min: 1 },
                    { key: 'maxSize', label: 'Maximum Size', type: 'number', default: 100, min: 1 }
                ]
            }]
        }]
    },
    capabilities: {
        required: ['timeline.read'],
        optional: ['audio.features.read']
    },
    render(props, _state, time, context) {
        // Required capability facets are available at runtime. The non-null assertion
        // only tells TypeScript about the capability declared above.
        const metadata = context.timeline!.getMetadata();
        if (!metadata.ok) return [];

        const phase = (Math.sin(time.seconds * Math.PI * 2) + 1) / 2;
        const size = props.minSize + (props.maxSize - props.minSize) * phase;
        return [new Rectangle(-size / 2, -size / 2, size, size, { fillColor: props.color })];
    }
});
```

The checked-in `src/pluginexamples` directories are the canonical larger examples and are built
by the same production and development builders used for plugin releases. Documentation links to
those sources instead of maintaining divergent copies.

Then type-check it from the plugin folder:

```sh
npx tsc --noEmit
```

### Schema-first props

The schema is both runtime inspector data and the source of TypeScript types for `props` in
`create`, `render`, and `dispose`. MVMNT infers property keys and standard values from the
property `type`, so changing a schema property updates the callback type automatically. Select
values are inferred from their declared `options`; use `as const` if a schema is stored in a
separate variable and you want its select values preserved as a literal union.

Use the explicit `definePluginElement<Props, State>()` form only when a plugin needs props that
cannot be represented by the inspector schema, such as a discriminated union or derived field.
When `create()` returns an object, its state type is inferred for `render()` and `dispose()`.

## Use capabilities and lifecycle correctly

Capabilities are declared per element, not globally:

- Put data essential to rendering in `required`. If the host cannot provide it, MVMNT skips that
  element and reports a diagnostic.
- Put enhancements in `optional`. Its context facet is `undefined` when unavailable, so branch
  before using it.
- API operations that can fail return `Result<T, PluginDiagnostic>`. Test `result.ok` before
  reading `result.value`.

Use lifecycle callbacks when the element needs state or setup:

```ts
const statefulPulse = definePluginElement({
    // type, metadata, schema, and capabilities omitted here
    type: 'stateful-pulse',
    metadata: { name: 'Stateful Pulse' },
    schema: { tabs: [] },
    capabilities: { required: [], optional: [] },
    create() {
        return { frames: 0 };
    },
    render(_props, state) {
        state.frames += 1;
        return [];
    },
    dispose(state) {
        // Release plugin-owned resources associated with this instance.
        void state;
    }
});
```

`load` runs once per loaded definition, `create` once per scene instance, `dispose` once per
instance, and `unload` once when the definition is removed or reloaded. `load` and `create` may
be asynchronous. Context-provided asset handles and calculator registrations are automatically
cleaned up; stop your own asynchronous work when `context.signal` aborts. See the
[lifecycle guide](plugin-lifecycle.md) and [capability guide](plugin-capabilities.md) for the
full rules.

## Build and import the plugin

The MVMNT checkout contains the plugin builder. From that checkout, point it at your plugin
folder:

```sh
npm run build-plugin /absolute/path/to/pulse-plugin
```

This validates the manifest and imports, bundles each entry as CJS with SDK modules external,
and creates:

```text
MVMNT/dist/com.example.pulse-1.0.0.mvmnt-plugin
```

Open MVMNT and use **Settings → Plugins → Import** to select that `.mvmnt-plugin` file. The
element appears in the scene-element picker under its configured category.

For hot reload while running MVMNT in development mode:

```sh
# Terminal 1, in the MVMNT checkout
npm run dev

# Terminal 2, in the MVMNT checkout
npm run dev-plugin -- /absolute/path/to/pulse-plugin
```

The development server performs a real SDK 2 build and archive load; it does not import source
files directly into Vite. The browser connects on port 7741, loads the initial in-memory archive,
and replaces the registered plugin after each successful rebuild. If MVMNT tried to connect before
the server was running, refresh the browser once.

See the [development loading guide](dev-plugin-workflow.md) for the complete request flow,
non-default ports, state and asset behavior, manifest changes, persistence, and troubleshooting.

### Font properties

Declare selectable fonts with a schema property whose `type` is `font`. MVMNT requests each
selected family and weight as soon as the scene instance is created and invalidates the canvas
when it becomes available; opening the Appearance inspector is not required. Use
`parseFontSelection()` to build a canvas font string because stored selections can represent a
Google font or a scene-managed custom-font asset:

```ts
import { parseFontSelection } from '@mvmnt-app/plugin-sdk/utils';

const selected = parseFontSelection(props.fontFamily);
const font = `${selected.weight ?? 400} 32px "${selected.family}", sans-serif`;
```

## Assets, audio, and next steps

Place bundled files under `assets/` beside `plugin.json`. Access them through
`context.assets`, not browser-relative URLs or MVMNT stores. Use `context.assets.project()` for
a user-selected visual asset and `context.assets.bundledImage()` or atlas helpers for packaged
assets.

Raw PCM reads are synchronous, return a defensive `Float32Array` copy, and have no sample-count
cap. Keep ranges short, account for allocation cost, and use feature sampling for history or
spectral data. Check `context.signal.aborted` around expensive asynchronous work.

For complete API names and supported subpaths, see the [SDK API inventory](plugin-sdk-api-inventory.md).
For existing SDK 1 plugins, use the [v1-to-v2 migration guide](plugin-v1-to-v2.md).
The checked-in, compilable fixture is [fixtures/plugin-sdk-v2](../../fixtures/plugin-sdk-v2).

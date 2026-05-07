# Plugin Development Quickstart

This guide gets you from zero to a working custom scene element in under 15 minutes.

If you already have an element working and want to go deeper, see [Creating Custom Elements](creating-custom-elements.md) and the [Plugin API v1 Reference](plugin-api-v1.md).

## Prerequisites

- Node.js 18+
- [MVMNT repo](https://github.com/Maokus/MVMNT.git) cloned and `npm install` run
- Basic TypeScript knowledge

## What You're Building

MVMNT scenes are composed of **scene elements** — visual objects that render on the canvas each frame. You'll write a TypeScript class that describes what properties your element exposes in the UI, and what it draws based on those properties and the current playback time.

Elements are grouped into **plugins** — a manifest file (`plugin.json`) plus one or more element class files. The build step bundles them into a single `.mvmnt-plugin` file for distribution.

## Step 1 — Create Your Element

Use the scaffold script to generate the boilerplate:

```bash
npm run create-element
```

Follow the prompts. Your new file will appear at `src/plugins/<your-plugin>/<element-type>.ts`.

**Or, write it manually.** Here's the smallest possible working element:

```typescript
// src/plugins/my-plugin/flash-box.ts
import {
    SceneElement,
    prop,
    tab,
    insertElementGroups,
    Rectangle,
    type RenderObject,
} from '@mvmnt/plugin-sdk';

export class FlashBoxElement extends SceneElement {
    constructor(id = 'flashBox', config: Record<string, unknown> = {}) {
        super('flash-box', id, config);
    }

    static override getConfigSchema() {
        return insertElementGroups(
            super.getConfigSchema(),
            { name: 'Flash Box', description: 'A box that pulses with time', category: 'custom' },
            [
                tab.properties([{
                    id: 'appearance',
                    label: 'Appearance',
                    collapsed: false,
                    properties: [
                        prop.colorAlpha('boxColor', 'Color', '#3B82F6FF'),
                        prop.number('size', 'Size', 100, { min: 10, max: 500, step: 1 }),
                    ],
                }]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        // Pulse the size with time
        const pulse = 0.8 + 0.2 * Math.sin(targetTime * Math.PI * 2);
        const s = props.size * pulse;

        return [new Rectangle(-s / 2, -s / 2, s, s, props.boxColor)];
    }
}
```

And the matching `plugin.json`:

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "apiVersion": "^1.0.0",
  "description": "A minimal example plugin",
  "author": "Your Name",
  "elements": [
    {
      "type": "flash-box",
      "entry": "flash-box.ts"
    }
  ]
}
```

## Step 2 — Test It Locally

Start the dev server:

```bash
npm run dev
```

Elements in `src/plugins/` are loaded automatically. Open the app, add a new element to your scene, and look for **Flash Box** in the element picker under **Custom**.

Changes you save to the `.ts` file hot-reload immediately — no restart needed.

## Step 3 — Add MIDI or Audio Reactivity

Once the basics work, connect your element to the timeline. Import `getPluginHostApi` and ask for the capabilities you need:

```typescript
import {
    SceneElement,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    Rectangle,
    type RenderObject,
} from '@mvmnt/plugin-sdk';

// In _buildRenderObjects:
const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
if (!api || status !== 'ok') return [];

const activeNotes = api.timeline.selectNotesInWindow({
    trackIds: [props.midiTrackId],
    startSec: targetTime - 0.001,
    endSec: targetTime + 0.001,
});

return activeNotes.map((note, i) =>
    new Rectangle(i * 20, 0, 18, (128 - note.note) * 2, props.color)
);
```

See [Plugin API v1](plugin-api-v1.md) for the full API surface, and [Creating Custom Elements](creating-custom-elements.md) for a deep-dive on audio reactivity, property types, and advanced patterns.

## Step 4 — Build and Distribute

When you're ready to share:

```bash
npm run build-plugin src/plugins/my-plugin
```

This produces `dist/com.example.my-plugin-1.0.0.mvmnt-plugin` — a single file users can import via the Settings panel.

## Where to Go Next

| Goal | Document |
|---|---|
| Full property type reference, lifecycle hooks, presets | [Creating Custom Elements](creating-custom-elements.md) |
| Timeline, audio, timing, and MIDI utilities | [Plugin API v1 Reference](plugin-api-v1.md) |
| Distributable bundle format and loading | [Runtime Plugin Loading](runtime-plugin-loading.md) |
| `manifest.json` field reference | [Plugin Manifest Schema](plugin-manifest.schema.json) |

## Tips

- **Render objects use local coordinates.** `(0, 0)` is the element's own origin — the element's canvas position is controlled by its `x`/`y`/`offsetX`/`offsetY` properties separately.
- **Colors are 8-digit hex** with alpha channel: `#RRGGBBAA`. Use the `colorAlpha` property type to let users pick them.
- **`targetTime` is in seconds.** Use `api.timing.secondsToBeats(targetTime)` when you need beat-relative positioning.
- **Keep render objects under ~1000 per frame.** For dense displays, use `limitRenderObjects` from the SDK.
- **Graceful degradation.** Always guard `getPluginHostApi()` results — the host API may not be ready on the first few frames.
- **Animation math is built in.** Use `clamp`, `remap`, `lerp`, `FloatCurve`, and the `easings` dictionary from `@mvmnt/plugin-sdk/animation` instead of reinventing interpolation helpers.

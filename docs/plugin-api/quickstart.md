# Plugin SDK 2 quickstart

This guide creates an external scene element plugin, previews it with hot reload, and packages it
for import. Use Node.js 22.12 or newer within the Node 22 release line so the MVMNT application and
plugin use the same supported environment.

## Download MVMNT

Clone the main repository and install its dependencies:

```bash
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm install
```

Keep this checkout available: you will run MVMNT's development server alongside the plugin server
when previewing the plugin.

## Create a plugin

Return to the parent directory, then run the generator so the plugin is created next to the MVMNT
checkout:

```bash
cd ..
npm create mvmnt-plugin@latest
cd pulse
npm install
npm run check
```

Choose a template from the interactive menu and use a reverse-domain plugin ID that you control.
For a non-interactive setup, pass `--name com.example.pulse --template minimal`. The generated project
contains `plugin.json`, one or more TypeScript element entries, assets, build configuration, and the
public SDK dependency.

Running the generator again from the plugin (or one of its nested directories) detects `plugin.json`
and offers to add another scene element instead of creating a separate plugin.

## Edit the element

Generated elements use `definePluginElement()` and schema builders:

```ts
import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const pulse = definePluginElement({
    type: 'pulse',
    metadata: { name: 'Pulse' },
    schema: {
        tabs: [tab.properties([group('shape', 'Shape', [prop.colorAlpha('color', 'Color', '#FF66CCFF')])])],
    },
    render({ props }) {
        const layoutBounds = new Rectangle(-50, -50, 100, 100, {
            fillColor: null,
            strokeColor: null,
            layoutParticipation: 'include',
        });
        const shape = new Rectangle(-50, -50, 100, 100, {
            fillColor: props.color,
            layoutParticipation: 'exclude',
        });
        return [layoutBounds, shape];
    },
});
```

Keep the definition `type` equal to its element entry in `plugin.json`. Import only the root SDK or
documented subpaths; application aliases such as `@core/*` and `@state/*` do not exist in external
plugins.

Run the contract and load-smoke checks after editing:

```bash
npm run check
```

## Understand the rendering model

The generated element is random-access: its output is a function of current props, requested time,
and host reads. Calculate ordinary motion from `time.seconds`; do not increment a frame counter or
position during rendering.

### Keep layout bounds stable

An element's layout bounds control its anchor, transform origin, selection handles, and hit area.
The example above already uses the stable layout-bounds pattern. Animated content can change size
from frame to frame, so give the element one fixed, invisible rectangle for layout and exclude
every visible object from layout bounds:

```ts
const layoutBounds = new Rectangle(-160, -90, 320, 180, {
    fillColor: null,
    strokeColor: null,
    layoutParticipation: 'include',
});
const pulse = new Rectangle(-50, -50, 100, 100, {
    fillColor: props.color,
    layoutParticipation: 'exclude',
});

return [layoutBounds, pulse];
```

Use this pattern even when the visible content currently has a fixed size. It keeps the intended
canvas size clear and prevents a later glow, label, waveform, or animation from changing the
element's placement. The invisible rectangle should be the only returned object with
`layoutParticipation: 'include'`; set all visible and decorative objects to `exclude`.

## Read audio and MIDI from the timeline

Plugins request host data through capabilities. The following small element lets the user choose
one audio track and one MIDI track. It reads a short raw PCM window to draw a level bar and reads
the notes active at the current timeline time to draw pitch markers.

First, request the two capabilities on the element entry in `plugin.json`:

```json
{
    "type": "pulse",
    "entry": "src/pulse.ts",
    "capabilities": {
        "required": ["timeline.read", "audio.raw.read"],
        "optional": []
    }
}
```

Then replace the element definition with:

```ts
import { definePluginElement, group, prop, tab } from '@mvmnt-app/plugin-sdk';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';

export const pulse = definePluginElement({
    type: 'pulse',
    metadata: { name: 'Timeline Pulse' },
    schema: {
        tabs: [
            tab.content([
                group('sources', 'Sources', [
                    prop.audioTrack('audioTrackId', 'Audio Track'),
                    prop.midiTrack('midiTrackId', 'MIDI Track'),
                ]),
            ]),
        ],
    },
    render({ props, time, context }) {
        const objects = [
            new Rectangle(-160, -90, 320, 180, {
                fillColor: null,
                strokeColor: null,
                layoutParticipation: 'include',
            }),
        ];

        if (props.audioTrackId) {
            const samples = context.audio!.getRawSamples({
                trackId: props.audioTrackId,
                startSeconds: Math.max(0, time.seconds - 0.025),
                endSeconds: time.seconds + 0.025,
                channel: 'mono',
            });

            if (samples.ok) {
                const peak = samples.value.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0);
                objects.push(
                    new Rectangle(-140, 45, 280 * peak, 24, {
                        fillColor: '#FF66CC',
                        layoutParticipation: 'exclude',
                    })
                );
            }
        }

        if (props.midiTrackId) {
            const notes = context.timeline!.selectNotes({
                trackIds: [props.midiTrackId],
                startSeconds: Math.max(0, time.seconds - 0.001),
                endSeconds: time.seconds + 0.001,
            });

            if (notes.ok) {
                for (const note of notes.value) {
                    const x = -140 + (note.note / 127) * 280;
                    const height = 20 + (note.velocity ?? 0.75) * 50;
                    objects.push(
                        new Rectangle(x - 4, 25 - height, 8, height, {
                            fillColor: '#66CCFFFF',
                            layoutParticipation: 'exclude',
                        })
                    );
                }
            }
        }

        return objects;
    },
});
```

Both reads are timeline-aware: clip placement is already reflected in the returned data, and audio
gaps produce silence. Host reads return `Result` values because data can be unavailable while a
source is loading. Check `.ok` and render a quiet or placeholder state instead of throwing.

Keep raw PCM requests short, as above. For long waveforms, spectra, or repeated analysis, use the
cached feature APIs introduced in the next guide.

Use [instance resources](instance-state.md) for handles and reusable objects. Use
[deterministic simulation](simulation.md) only when a value genuinely depends on the previous step,
as in the `midi-spring` template. The [Plugin SDK guide](README.md) has a quick decision table.

## Preview with hot reload

Start both development servers in separate terminals.

In the first terminal, start MVMNT from the main repository checkout:

```bash
cd /path/to/MVMNT
npm run dev
```

In the second terminal, start the plugin server from the generated plugin project:

```bash
cd /path/to/pulse
npm run dev
```

In MVMNT, open **Scene Settings → Developer** and scan for a Development Plugin Server. Saving source,
manifest, or asset files rebuilds and reloads the plugin. See the
[development workflow](development-workflow.md) for ports and failure behavior.

## Package and import

```bash
npm run build
```

The distributable `.mvmnt-plugin` archive is written under `dist/`. Import it through MVMNT's plugin
settings.

## Continue learning

- [API capabilities tour](api-capabilities.md) — useful timeline, audio, timing, animation, and
  property APIs to try next.
- [Plugin SDK guide](README.md) — mental model, project structure, and learning path.
- [Authoring guide](authoring.md) — schemas, capabilities, lifecycle, and properties.
- [Instance resources](instance-state.md) — retained runtime resources and deterministic caching.
- [Deterministic simulation](simulation.md) — fixed-step springs, particles, and MIDI impulses.
- [Rendering and assets](rendering-and-assets.md) — render objects and packaged visuals.
- [Audio](audio.md) — analyzed features, raw PCM, and custom calculators.
- [API reference](reference.md) — package subpaths and manifest contract.

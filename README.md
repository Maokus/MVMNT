# MVMNT

MVMNT (pronounced *movement*) is a React-based MIDI visualization application for creating polished social media videos from MIDI files. The project ships with a store-first architecture, deterministic export pipeline, and tooling to design custom animations without leaving the browser.

### Scene Files (.mvt)

Scenes can now be saved and loaded using a compact `.mvt` file extension (JSON payload internally). Older exports with `.mvmnt.scene.json` are still supported on import. Filenames are used to restore the scene name if the embedded metadata is missing.

### License

MVMNT is released under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this software and make it available to users, you must also provide those users access to the complete corresponding source code of your modified version under the same license. See the `LICENSE` file for details.

### Installation

```
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm install
npm run dev
```

The development server runs on Vite with hot module replacement. If optional Rollup native dependencies fail to compile on your platform, rerun `npm install` so npm can choose a compatible fallback build.

### Validation

Before opening a pull request, run the full verification suite:

```
npm run test
npm run build
npm run lint
```

If `npm run test` fails because of missing optional binaries, rerun `npm install` and execute the tests again.

### Custom sceneElements

Elements are the things you see and can move around. They are located in `src/core/scene/elements`. They inherit from `SceneElement` in `base.ts`.

For an example of a simple sceneElement, lets look at the text element.

```
export class TextOverlayElement extends SceneElement {
    constructor(id: string = 'textOverlay', config: { [key: string]: any } = {}) {
        super('textOverlay', id, config);
    }

    static getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        return {
            <removed for brevity>
        };
    }

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const renderObjects: RenderObject[] = [];

        // Get properties from bindings
        const text = this.getProperty('text') as string;
        <removed>
        const textElement = new Text(0, 0, text, font, color, 'center', 'middle');
        renderObjects.push(textElement);

        return renderObjects;
    }
}
```

two important functions are defined: `getConfigSchema` tells the ui how to render controls. `_buildRenderObjects` is invoked by the scene runtime after the Zustand store resolves element configuration and returns an array of RenderObjects.

In `_buildRenderObjects`, the controls defined in `getConfigSchema` are accessed through **bindings**. You don't need to know how these work, only that you can access these settings through `this.getProperty('id')`.

### Custom piano roll animations

The `/animation-test` route helps design animations for the time unit piano roll. These animations live in `src/animation/note-animations`.
To make a new animation:

1. Create a new filename
2. Copy the contents of template.ts into the file
3. Rename the class
4. Uncomment registerAnimation at the bottom and fill in the details

This registers the animation so it appears in `/animation-test` and the main app.

### Debug stuff

`window.mvmntTools.timeline.setMasterTempoMap([{ time: 0, bpm: 100 }, { time: 3, bpm: 200 }])` run in the console in the default scene adds a tempo map to the time unit piano roll via the store-driven timeline adapter.

`localStorage.setItem("VIS_DEBUG",1)` enables debug logging.

`localStorage.removeItem("mvmnt_onboarded_v1")` re-enables onboarding modal

```
window.mvmntTools.scene.dispatch(
  {
    type: 'updateElementConfig',
    elementId: 'background',
    patch: { offsetX: 120 },
  },
  { source: 'console tweak' }
);

patch: { offsetX: { type: 'macro', macroId: 'beat-shift' } }
```

### Recent Export Fixes (Audio Feature Branch)

Two issues in the video export flow were resolved:

1. Playback range offset: exporting a sub-range (e.g. 4s–6s) previously produced a file whose internal timestamps started at 4s, yielding leading blank/black frames. Frame timestamps are now normalized to start at 0 so the output duration equals the selected range with no initial gap.
2. Missing audio: when `includeAudio` was set without explicit `startTick` / `endTick`, delegation to the offline audio/video (`AVExporter`) path was skipped, resulting in silent MP4s. The exporter now derives tick range from the active playback range (tempo + PPQ) if ticks are not provided, enabling deterministic audio mixing. Frame timestamps in the AV path are also zero-based to keep audio and video aligned.

See tests: `src/export/__tests__/video-export-timestamps.test.ts`.

### New: Custom Export Filenames

The Render / Export modal now includes a Filename field. Leave it blank to fall back to the current scene name.

-   MP4 exports: the proper `.mp4` extension is enforced (added if missing).
-   PNG sequence exports: downloaded as a `.zip` (frames inside remain `frame_00000.png`, etc.). If you provide an extension other than `.zip`, it will still be normalized to `.zip`.

Any disallowed characters are sanitized to underscores before download.

### Further Reading

-   `docs/ARCHITECTURE.md` – subsystem boundaries and data flow.
-   `docs/SCENE_STORE.md` – canonical store structure and mutation patterns.
-   `docs/TIME_DOMAIN.md` – tick-first timing architecture and helper APIs.
-   `docs/VALIDATION_MATRIX.md` – import guard taxonomy.

### Time Display: Offset Bars Property

The `TimeDisplayElement` supports an `offsetBars` property (default `0`) which shifts the _displayed_ musical (bar:beat:tick) and real (mm:ss:ms) time by a specified number of bars.

Use cases:

-   Start counting bars from a different reference (e.g. display pickup / pre-roll as negative or start main section at bar 001).
-   Align the visual counter with an arrangement section when the underlying transport starts earlier.

Behavior:

-   Positive values move the shown time forward (e.g. `offsetBars: 2` makes real 0s display as bar 003).
-   Negative values move the shown time backward, but real time never goes below 0 (display clamps at bar 001 / 00:00:000).
-   Internal timing, transport, and other elements are unaffected; only the displayed labels change.

Config schema example (JSON scene snippet):

```json
{
    "type": "timeDisplay",
    "id": "timeDisplay",
    "bindings": {
        "offsetBars": 2
    }
}
```

Edge cases:

-   Large offsets are bounded (currently -512..512 in UI schema) to prevent accidental huge shifts.
-   With tempo maps, the offset conversion uses the current timing manager for accurate seconds mapping.

# MVMNT

MVMNT (pronounced _movement_) is a React-based MIDI visualization application for creating polished social media videos from MIDI files. The project ships with a store-first architecture, deterministic export pipeline, and tooling to design custom animations without leaving the browser.

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

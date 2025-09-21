# MVMNT

MVMNT (pronounced Movement) is a React-based MIDI visualization application for creating social media videos from MIDI files.

### Scene Files (.mvt)

Scenes can now be saved and loaded using a compact `.mvt` file extension (JSON payload internally). Older exports with `.mvmnt.scene.json` are still supported on import. Filenames are used to restore the scene name if the embedded metadata is missing.

### License

MVMNT is released under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this software and make it available to users, you must also provide those users access to the complete corresponding source code of your modified version under the same license. See the `LICENSE` file for details.

### Installation

```
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm i
npm run start
```

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

two important functions are defined: `getConfigSchema` tells the ui how to render controls. `_buildRenderObjects` is called by the scene builder, and returns an array of RenderObjects.

In `_buildRenderObjects`, the controls defined in `getConfigSchema` are accessed through **bindings**. You don't need to know how these work, only that you can access these settings through `this.getProperty('id')`.

### Custom piano roll animations

The /animation-test is a page made to help design animations for the time unit piano roll. These animations can be found in `src/animation/note-animations`
To make a new animation:

1. Create a new filename
2. Copy the contents of template.ts into the file
3. Rename the class
4. Uncomment registerAnimation at the bottom and fill in the details

This should add the animation such that it will be selectable from `/animation-test` and in the main app!

### Debug stuff

`vis.sceneBuilder.getElementsByType("timeUnitPianoRoll")[0].midiManager.timingManager.setTempoMap([{time:0, bpm:100}, {time:3, bpm:200}])` run in the console in the default scene adds a tempo map to the time unit piano roll.

`localStorage.setItem("VIS_DEBUG",1)` enables debug logging.

`localStorage.removeItem("mvmnt_onboarded_v1")` re-enables onboarding modal

```
window.__mvmntDebug.getTimingState()
window.__mvmntDebug.setGlobalBpm(140)
window.__mvmntDebug.setBeatsPerBar(3)
window.__mvmntDebug.setCurrentTick(960 * 4) // seek to bar 2 (PPQ 960 example)
window.__mvmntDebug.s2b(10) -> beats
window.__mvmntDebug.b2s(32) -> seconds
window.__mvmntDebug.s2bars(10) / window.__mvmntDebug.bars2s(8)
window.__mvmntDebug.getBeatGrid(0, 30)
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

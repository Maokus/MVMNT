# MVMNT

MVMNT (pronounced Movement) is a React-based MIDI visualization application for creating social media videos from MIDI files.

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

### Custom TUPR animations

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

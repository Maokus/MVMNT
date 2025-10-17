# MVMNT

> Create polished MIDI-driven motion graphics without leaving your browser.

MVMNT (pronounced _movement_) is a React-powered MIDI visualization studio for producing social-media-ready videos from standard MIDI files. The project embraces a store-first architecture, deterministic rendering pipeline, and in-browser tooling so artists can experiment, iterate, and export with confidence.

## Table of Contents

-   [Features](#features)
-   [Quick Start](#quick-start)
-   [Development Workflow](#development-workflow)
-   [Scene Files](#scene-files)
-   [Extending MVMNT](#extending-mvmnt)
    -   [Custom Scene Elements](#custom-scene-elements)
    -   [Custom Piano Roll Animations](#custom-piano-roll-animations)
-   [Debug Utilities](#debug-utilities)
-   [License](#license)

## Features

-   **Deterministic exports** – a reproducible render pipeline ensures your final video always matches what you preview in the browser.
-   **Store-driven architecture** – centralized state management keeps elements in sync across the UI, scene runtime, and export tools.
-   **Customizable visuals** – craft bespoke looks through configurable scene elements, animation presets, and extensible tooling.
-   **Scene portability** – save and load complete project files using the compact `.mvt` format, with backwards compatibility for legacy `.mvmnt.scene.json` exports.
-   **Developer-friendly tooling** – powered by Vite, Tailwind, and TypeScript for instant feedback and a modern DX.

## Quick Start

```bash
git clone https://github.com/Maokus/MVMNT.git
cd MVMNT
npm install
npm run dev
```

The development server runs on Vite with hot module replacement. If optional Rollup native dependencies fail to compile on your platform, rerun `npm install` so npm can choose a compatible fallback build.

## Development Workflow

Before opening a pull request, verify your changes with the full test suite:

```bash
npm run test
npm run build
npm run lint
```

If `npm run test` fails because of missing optional binaries, rerun `npm install` and execute the tests again.

## Scene Files

Scenes can be saved and restored with a compact `.mvt` file (internally a JSON payload). Older exports using the `.mvmnt.scene.json` suffix remain supported on import. When embedded metadata is absent, MVMNT falls back to the filename to restore the scene name.

## Extending MVMNT

### Custom Scene Elements

Scene elements represent the visuals you can place on the canvas. They live in `src/core/scene/elements` and inherit from `SceneElement` in `base.ts`.

Audio-reactive elements should follow the registration pattern introduced in the v4 audio system.
See [docs/audio/quickstart.md](docs/audio/quickstart.md) for a full walkthrough.

Below is a simplified example that registers spectrogram requirements and samples data lazily during
render:

```ts
import { registerFeatureRequirements } from '@core/scene/elements/audioElementMetadata';
import { getFeatureData } from '@audio/features/sceneApi';

registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

export class AudioSpectrumElement extends SceneElement {
    protected override _buildRenderObjects(config: unknown, targetTime: number): RenderObject[] {
        const trackId = this.getProperty<string>('audioTrackId');
        if (!trackId) {
            return [];
        }

        const smoothing = this.getProperty<number>('smoothing') ?? 0;
        const sample = getFeatureData(this, trackId, 'spectrogram', targetTime, { smoothing });
        if (!sample) {
            return [];
        }

        return sample.values.map((magnitude, index) => {
            const height = Math.max(0, magnitude + 80) * 2;
            return new Rectangle(index * 6, 0, 4, height, '#00ffcc');
        });
    }
}
```

Key points:

-   `registerFeatureRequirements` is called once when the module loads so the runtime knows which
    descriptors to subscribe to. These requirements are never surfaced to end users.
-   `getFeatureData` fetches the tempo-aligned frame and applies runtime presentation options (such as
    smoothing) without changing the underlying cache identity.
-   Element properties (e.g., `audioTrackId`, `smoothing`) remain user-configurable through the
    standard config schema.

### Custom Piano Roll Animations

Use the `/animation-test` route to design animations for the time-unit piano roll. Animations live in `src/animation/note-animations`.

To add a new animation:

1. Create a new file in `src/animation/note-animations`.
2. Copy the contents of `template.ts` into the file.
3. Rename the class and customize the implementation.
4. Uncomment `registerAnimation` at the bottom and update the metadata.

Once registered, the animation appears in both `/animation-test` and the main application.

## Debug Utilities

-   `window.mvmntTools.timeline.setMasterTempoMap([{ time: 0, bpm: 100 }, { time: 3, bpm: 200 }])` adds a tempo map to the time unit piano roll via the store-driven timeline adapter.
-   `localStorage.setItem("VIS_DEBUG", 1)` enables verbose visualization debug logging.
-   `localStorage.removeItem("mvmnt_onboarded_v1")` re-enables the onboarding modal.
-   Dispatch manual scene updates from the console:

    ```ts
    window.mvmntTools.scene.dispatch(
        {
            type: 'updateElementConfig',
            elementId: 'background',
            patch: { offsetX: 120 },
        },
        { source: 'console tweak' }
    );

    // Example macro patch
    // patch: { offsetX: { type: 'macro', macroId: 'beat-shift' } }
    ```

## License

MVMNT is released under the GNU Affero General Public License v3.0 (AGPL-3.0). If you modify this software and make it available to users, you must also provide those users access to the complete corresponding source code of your modified version under the same license. See the [`LICENSE`](LICENSE) file for details.

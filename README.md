# MVMNT

> Create polished MIDI-driven motion graphics without leaving your browser.

MVMNT (pronounced _movement_) is a React-powered MIDI visualization studio for producing social-media-ready videos from standard MIDI files. The project embraces a store-first architecture, deterministic rendering pipeline, and in-browser tooling so artists can experiment, iterate, and export with confidence.

## Table of Contents

-   [Quick Start](#quick-start)
-   [Development Workflow](#development-workflow)
-   [Scene Files](#scene-files)
-   [Extending MVMNT](#extending-mvmnt)
    -   [Custom Scene Elements](#custom-scene-elements)
    -   [Custom Piano Roll Animations](#custom-piano-roll-animations)
-   [Debug Utilities](#debug-utilities)
-   [License](#license)

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
npm run compile
```

If `npm run test` fails because of missing optional binaries, rerun `npm install` and execute the tests again.

## Extending MVMNT

### Custom Scene Elements



### Custom Piano Roll Animations

Use the `/animation-test` route to design animations for the time-unit piano roll. 

To add a new animation:

1. Create a new file in `src/core/scene/elements/midi-displays/note-animations`.
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

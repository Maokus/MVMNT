# MIDI Social Post Visualizer

A React-based MIDI visualization application for creating social media videos from MIDI files.

### Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `yarn build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### Debug stuff 

`vis.sceneBuilder.getElementsByType("timeUnitPianoRoll")[0].midiManager.timingManager.setTempoMap([{time:0, bpm:100}, {time:3, bpm:200}])` run in the console in the default scene adds a tempo map to the time unit piano roll. 

`localStorage.setItem("VIS_DEBUG",1)` enables debug logging.
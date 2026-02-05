MVMNT is a react-based web app for making midi visualizations.

When setting up the environment, always run `npm install` (rather than `npm ci`) so npm can select binaries compatible with your platform.

When you are finished, run all of the following commands to verify that all proposed changes are working correctly

```
npm run test
npm run build
npm run lint
```

If `npm run test` fails because an optional Rollup native dependency is missing, run `npm install` and rerun `npm run test` before continuing.

When asked to "implement phase x" of a plan, read through the requirements and goals of the phase clearly, and do not exit until the goals are met. If the implementation of the phase requires writing code, WRITE THE CODE. DO NOT simply mark the phase as complete.

## Directory Structure

-   `/docs` documentation files on existing, implemented code.
-   `/src` the main code
-   `/thoughts` temporary documents containing plans or research

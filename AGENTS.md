MVMNT is a react-based web app for making midi visualizations.

When setting up the environment, always run `npm install` (rather than `npm ci`) so npm can select binaries compatible with your platform.

When you are finished, run all of the following commands to verify that all proposed changes are working correctly

```
npm run test
npm run build
npm run lint
```

If `npm run test` fails because an optional Rollup native dependency is missing, run `npm install` and rerun `npm run test` before continuing.

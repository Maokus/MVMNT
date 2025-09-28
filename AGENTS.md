MVMNT is a react-based web app for making midi visualizations.

When setting up the environment, first run `npm install` (rather than `npm ci`) to install the correct packages for your development environment.

When you are finished, run all of the following commands to verify that all proposed changes are working correctly

```
npm run test
npm run build
npm run lint
```

If any of these commands throws an error because of a missing optional rollup native dependency, run `npm install`, then `npm run test` again.

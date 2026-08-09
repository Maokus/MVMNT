# Creating custom elements

Plugin-facing elements use SDK 2 definitions from `@mvmnt-app/plugin-sdk`. Start with the
[SDK 2 quickstart](plugin-api/plugin-quickstart.md), then use the
[capability](plugin-api/plugin-capabilities.md) and
[lifecycle](plugin-api/plugin-lifecycle.md) references for host data and cleanup.

Runnable examples are maintained as build inputs rather than copied into this guide:

Use an external plugin project with plugin-side `npm run dev` to develop and hot-reload custom elements.

- `fixtures/plugin-sdk-v2` proves the packed public package supports property schemas,
  timeline data, raw audio, feature audio, and bundled assets.

Every source manifest uses `"apiVersion": "^2.0.0"`, and each element declares required and optional
capabilities once in that manifest. Build a generated project from its own directory with:

```sh
npm run build
```

The [SDK 1 to SDK 2 migration guide](plugin-api/plugin-v1-to-v2.md) lists replacements for removed
global access patterns; new plugins use callback-scoped SDK 2 facets.

For the live development loop, including how rebuild events turn into unload/reload operations,
see [Developing plugins with hot reload](plugin-api/dev-plugin-workflow.md).

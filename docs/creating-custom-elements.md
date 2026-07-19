# Creating custom elements

Plugin-facing elements use SDK 2 definitions from `@mvmnt-app/plugin-sdk`. Start with the
[SDK 2 quickstart](plugin-api/plugin-quickstart.md), then use the
[capability](plugin-api/plugin-capabilities.md) and
[lifecycle](plugin-api/plugin-lifecycle.md) references for host data and cleanup.

Runnable examples are maintained as build inputs rather than copied into this guide:

- `src/pluginexamples/patternspack1` shows capability-free renderers.
- `src/pluginexamples/fnf` shows timeline-driven bundled atlases.
- `src/pluginexamples/midipack1` shows larger timeline-driven visualisations.
- `fixtures/plugin-sdk-v2` proves the packed public package supports property schemas,
  timeline data, raw audio, feature audio, and bundled assets.

Every source manifest uses `"apiVersion": "^2.0.0"`, and each element repeats the exact required
and optional capability lists from its definition. Build an example with:

```sh
npm run build-plugin -- src/pluginexamples/patternspack1
```

The frozen [SDK 1 reference](plugin-api/plugin-api-v1.md) documents compatibility bundles only;
do not use it for new source.

For the live development loop, including how rebuild events turn into unload/reload operations,
see [Developing plugins with hot reload](plugin-api/dev-plugin-workflow.md).

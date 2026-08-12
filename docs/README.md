# MVMNT documentation

MVMNT's documentation serves two audiences. Application contributors should start with the
[contributor guide](contributors/getting-started.md). Authors building external scene elements should
start with the [plugin quickstart](plugin-api/quickstart.md).

## Contributors

- [Getting started](contributors/getting-started.md) — setup, commands, repository layout, and
  contribution workflow.
- [Architecture](contributors/architecture.md) — domain ownership and application data flow.
- [State and commands](contributors/state-and-commands.md) — Zustand stores, command gateways,
  selection, and undo.
- [Scene format and persistence](contributors/scene-format-and-persistence.md) — `.mvt` packages,
  schema validation, migrations, and import/export.
- [Timeline and automation](contributors/timeline-and-automation.md) — ticks, clips, transport, and
  property automation.
- [Rendering](contributors/rendering.md) — render objects, scene resolution, and perspective.
- [Properties and resources](contributors/properties-and-resources.md) — inspector layouts, visual
  assets, and fonts.
- [Audio system](contributors/audio-system.md) — source storage, decoded audio, feature caches, and
  sampling.
- [Desktop and export](contributors/desktop-and-export.md) — Electron boundaries, background jobs,
  packaging, and command-line rendering.
- [Versioning and releases](versioning-and-releases.md) — build channels, artifact naming, releases,
  and update notifications.
- [Local backend](contributors/local-backend.md) — running the Supabase community backend locally.

## Plugin authors

- [Quickstart](plugin-api/quickstart.md)
- [Development workflow](plugin-api/development-workflow.md)
- [Authoring guide](plugin-api/authoring.md)
- [Rendering and assets](plugin-api/rendering-and-assets.md)
- [Audio](plugin-api/audio.md)
- [API reference](plugin-api/reference.md)
- [Compatibility policy](plugin-api/compatibility.md)
- [SDK 1 to SDK 2 migration](plugin-api/migration-v1-to-v2.md)

## Compatibility status

[Current development state](current-state.md) records the active pre-release compatibility policy.
All other pages describe current behavior and should remain free of roadmap or rollout language.

## Documentation ownership

When behavior changes, update the guide owned by that domain in the same change. Treat executable
code, tests, schemas, package manifests, and generator templates as the sources of truth. Run the
documentation link check before submitting changes:

```bash
npm run docs:check
```

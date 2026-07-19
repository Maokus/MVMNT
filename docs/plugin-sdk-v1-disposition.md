# Plugin SDK 1 disposition report

| V1 surface | SDK 2 disposition |
| --- | --- |
| Render primitives and pure animation/colour/MIDI helpers | Supported package exports |
| `SceneElement`, property factories/groups | V1 compatibility only; schemas remain host data |
| `getPluginHostApi`, `getRequiredPluginApi` | V1 compatibility only |
| `timelineApi`, `audioApi`, `audioRawApi`, `timingApi`, utility proxies | V1 compatibility only |
| Silent shortcuts such as `selectNotes`, `sampleAudio`, timing shortcuts | V1 compatibility only |
| Audio calculator global registry and module-scope feature registration | V1 compatibility only |
| Internal track/store snapshots and application-alias types | Removed from public declarations |
| `visual-assets` subpath | Supported, with scoped `AssetApi` as the v2 boundary |
| React externals | Loader compatibility only; not part of the SDK contract |
| `@core/*`, `@audio/*`, `@state/*`, and other application aliases | Internal and rejected for v2 |

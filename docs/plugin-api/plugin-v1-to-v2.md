# Migrating plugin SDK 1 to 2

1. Change `apiVersion` to `^2.0.0` and add per-element required/optional capabilities.
2. Replace a `SceneElement` subclass with `definePluginElement()`.
3. Move module-scope registrations into `load` or `create`.
4. Replace `getRequiredPluginApi`, direct proxies, and shortcut calls with the callback context.
5. Replace store/track objects with readonly SDK DTOs and handle `Result` failures.
6. Move cleanup into `dispose`/`unload`; use the supplied signal for cancellation.

SDK 1 bundles are no longer accepted by the loader. Rebuild the migrated source against
`@mvmnt-app/plugin-sdk` before importing or upgrading the plugin.

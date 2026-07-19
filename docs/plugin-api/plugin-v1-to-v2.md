# Migrating plugin SDK 1 to 2

1. Change `apiVersion` to `^2.0.0` and add per-element required/optional capabilities.
2. Replace a `SceneElement` subclass with `definePluginElement()`.
3. Move module-scope registrations into `load` or `create`.
4. Replace `getRequiredPluginApi`, direct proxies, and shortcut calls with the callback context.
5. Replace store/track objects with readonly SDK DTOs and handle `Result` failures.
6. Move cleanup into `dispose`/`unload`; use the supplied signal for cancellation.

Existing installed bundles targeting supported `^1.x` ranges continue to receive the frozen v1
root and subpath modules, including their legacy silent/default behaviours. V1 accessors and the
class base are not the v2 authoring model.

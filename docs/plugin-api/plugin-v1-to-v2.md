# Migrating plugin SDK 1 to 2

1. Change `apiVersion` to `^2.0.0` and add per-element required/optional capabilities.
2. Replace a `SceneElement` subclass with `definePluginElement()`.
3. Move module-scope registrations into `load` or `create`.
4. Replace `getRequiredPluginApi`, direct proxies, and shortcut calls with the callback context.
5. Replace store/track objects with readonly SDK DTOs and handle `Result` failures.
6. Move cleanup into `dispose`/`unload`; use the supplied signal for cancellation.

## Property-schema change

SDK 2 has no `range` property kind or `prop.range()` helper. Replace each
slider property with `number`/`prop.number()` and add serializable group layout
metadata when it should render as a slider:

```ts
{
    id: 'appearance', label: 'Appearance', collapsed: false,
    properties: [prop.number('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 })],
    layout: [
        { kind: 'control', control: 'slider', bindings: { value: 'opacity' } },
        { kind: 'property', propertyKey: 'opacity' },
    ],
}
```

Keep the paired property node: it preserves macro assignment, keyframes, and
precise numeric entry alongside the slider.

SDK 1 bundles are no longer accepted by the loader. Rebuild the migrated source against
`@mvmnt-app/plugin-sdk` before importing or upgrading the plugin.

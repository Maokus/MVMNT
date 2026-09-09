# Migrate SDK 1 plugins to SDK 2

1. Set `apiVersion` to a compatible SDK 2 range and add required/optional capabilities to every
   element entry in `plugin.json`.
2. Replace each `SceneElement` subclass with `definePluginElement()` callbacks.
3. Move module-scope host registrations into `load()` or `createResources()`.
4. Replace global accessors, proxies, application imports, and store objects with callback-context
   facets and readonly SDK DTOs.
5. Handle structured `Result` failures from host services.
6. Move instance cleanup into `disposeResources()`, definition cleanup into `unload()`, and stop asynchronous
   work when the supplied signal aborts.

## Property schemas

SDK 2 has no `range` property kind. Use a numeric property and serializable slider layout:

```ts
group('appearance', 'Appearance', [prop.number('opacity', 'Opacity', 1, { min: 0, max: 1, step: 0.01 })], {
    layout: [
        { kind: 'control', control: 'slider', bindings: { value: 'opacity' } },
        { kind: 'property', propertyKey: 'opacity' },
    ],
});
```

Keep the ordinary property row to preserve precise entry, macro assignment, and keyframes.

## Rebuild

Install the current `@mvmnt-app/plugin-sdk`, run the generated project's checks, and build a new
`.mvmnt-plugin` archive. MVMNT does not provide an SDK 1 runtime shim.

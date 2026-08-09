# Scene runtime structure

Scene code follows one dependency direction:

```text
built-in definitions or plugin bundles
                  ↓
          definition runtime
                  ↓
       normalized registration
                  ↓
              registry
                  ↓
       SceneRuntimeAdapter/state
```

- `built-ins/` contains shipped SDK 2 definitions. Add new definitions to `builtInCatalog`.
- `authoring/` contains examples and templates; it is not part of the shipped built-in inventory.
- `runtime/` owns definition lifecycle, bound properties, resources, render wrapping, and bounds.
- `registry/` stores registrations and bootstraps the default built-in registry.
- `plugins/` owns external bundle loading, validation, capabilities, and injected host services.

The registry schema is serializable SDK data. Host-only coercion metadata may exist while a legacy
class renderer is adapted, but `definition-runtime` removes it before registration. Runtime adapter
classes must not be exported from the built-in barrel.

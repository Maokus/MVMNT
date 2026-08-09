# Plugin element lifecycle

`load` runs once for a loaded definition. `create` then runs once per scene instance and may be
asynchronous. Until both complete, rendering returns no objects. Initialization failures emit an
`INITIALIZATION_FAILED` diagnostic and keep the instance inert.

`dispose` runs for an instance and `unload` runs when its definition is disabled, reloaded,
upgraded, or removed. Each lifetime has an `AbortSignal`. Calculator registrations, asset handles,
and other resources created through its context are tracked and cleaned automatically. Plugins
should still stop their own asynchronous loops when the signal aborts.

`load` and `unload` receive the definition-scoped `CapabilityContext`. `create`, `render`, and `dispose` receive an
instance-scoped `ElementContext<Props>`, which adds `context.properties` for sampling that instance's effective
property values. Property access is unavailable at definition scope because no scene-element instance exists yet.

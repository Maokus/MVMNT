# Plugin element lifecycle

`load` runs once for a loaded definition. `create` then runs once per scene instance and may be
asynchronous. Until both complete, rendering returns no objects. Initialization failures emit an
`INITIALIZATION_FAILED` diagnostic and keep the instance inert.

`dispose` runs for an instance and `unload` runs when its definition is disabled, reloaded,
upgraded, or removed. Each lifetime has an `AbortSignal`. Calculator registrations, asset handles,
and other resources created through its context are tracked and cleaned automatically. Plugins
should still stop their own asynchronous loops when the signal aborts.

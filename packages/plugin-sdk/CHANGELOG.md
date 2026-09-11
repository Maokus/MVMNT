# Changelog

## 2.2.0

- Added the additive `Add` (`lighter`) mode to blend-mode property choices.
- Made the npm package ESM-only and added clean packed-consumer validation.
- Made font parsing/loading explicitly host-provided, project-aware operations with matching
  `Promise<void>` loading semantics.
- Renamed `AudioFeatureMatrix.format` to `sourceFormat`; matrix data is always normalized float data.
- Defined calculator registration as a narrow raw-PCM grant during calculator execution.
- Made no-argument `TimelineApi.getTracks()` return all supported tracks and report the actual
  playback range in metadata.
- Added opt-in deterministic simulation with fixed-step `initialize()`/`step()` callbacks,
  checkpointable state, immutable input generations, and a read-only render snapshot.
- Added versioned, stateless simulation randomness through initialization `random` and
  `context.random`, keyed by the authored seed and canonical step.
- Added `simulation` to the named render input; it is `undefined` for ordinary random-access elements.
- Render callbacks take a named `RenderInput` with props, time, context, and optional resources.
- `createResources()` and synchronous `disposeResources()` use allocation-only `ResourceContext`;
  `onCleanup()` covers partial initialization and cancellation. Removed positional callbacks and
  the superseded `create`/`dispose` hooks from the pre-release SDK 2 contract.
- Made instance disposal synchronous so the public contract matches the host lifecycle.
- Added instance-scoped `context.properties.valueAt()` access to effective property values at arbitrary timeline
  times.
- Added bounded adaptive `context.properties.integrate()` and `average()` helpers for numeric properties without
  exposing automation channels or keyframes.
- Added the serializable `group()` schema builder and literal-key inference across `prop`, `group`, and `tab`.
- Made `plugin.json` the sole external capability declaration and moved first-party grants behind a host wrapper.
- Focused the root barrel on common authoring primitives; advanced runtime types remain available from domain subpaths.
- Removed the class renderer bridge, host schema insertion helper, and named host-service delegation adapters before
  the SDK 2 contract freezes.

## 2.1.0

- Added packed `sampleFeatureMatrix()` audio reads with clip coverage and opaque revisions.
- Added content-addressed `generatedRaster()` assets backed by host-managed memory budgets.

## 2.0.0

- Added `definePluginElement()` and callback-scoped capability contexts.
- Added SDK-owned readonly DTOs and structured `Result<T, PluginDiagnostic>` failures.
- Added root and domain package exports, including `visual-assets`.
- Added named, capability-scoped adapters for every timeline, audio, timing, and asset operation.
- Removed global accessors; host data is available only through SDK 2 callback contexts.

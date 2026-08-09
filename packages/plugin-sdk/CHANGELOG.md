# Changelog

## 2.2.0

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

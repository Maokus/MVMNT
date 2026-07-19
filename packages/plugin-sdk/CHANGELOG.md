# Changelog

## 2.0.0

- Added `definePluginElement()` and callback-scoped capability contexts.
- Added SDK-owned readonly DTOs and structured `Result<T, PluginDiagnostic>` failures.
- Added root and domain package exports, including `visual-assets`.
- Added named, capability-scoped adapters for every timeline, audio, timing, and asset operation.
- Removed global accessors; host data is available only through SDK 2 callback contexts.

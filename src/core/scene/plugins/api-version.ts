/**
 * Plugin API version — incremented independently of the MVMNT app version.
 *
 * Bump rules:
 *  - PATCH: no-breaking additions or fixes to the plugin SDK
 *  - MINOR: new capabilities or exports added (backwards-compatible)
 *  - MAJOR: breaking changes to the plugin API surface
 *
 * Plugins declare a semver range in their manifest `apiVersion` field (e.g. "^1.0.0").
 * The loader rejects plugins whose range does not satisfy this constant.
 */
export const PLUGIN_API_VERSION = '1.1.0';

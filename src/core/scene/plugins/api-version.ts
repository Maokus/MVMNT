/**
 * Plugin API version — incremented independently of the MVMNT app version.
 *
 * Bump rules:
 *  - PATCH: no-breaking additions or fixes to the plugin SDK
 *  - MINOR: new capabilities or exports added (backwards-compatible)
 *  - MAJOR: breaking changes to the plugin API surface
 *
 * Plugins declare a semver range in their manifest `apiVersion` field.
 */
export const PLUGIN_SDK_VERSION = '2.2.0' as const;

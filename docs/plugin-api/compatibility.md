# Plugin SDK compatibility

SDK 2.2 is the current published MVMNT plugin contract. New plugins should declare `^2.2.0` in
`plugin.json`; this accepts compatible SDK 2 minor and patch releases while excluding a future SDK 3.

The contract follows semantic versioning. Additive DTO fields, helpers, and optional capabilities
are minor changes; compatible fixes are patch changes; removals and callback, DTO, capability, or
package-layout incompatibilities require a new major version. MVMNT accepts plugins whose declared
SDK range includes the host's SDK version.

The public npm SDK is ESM-only. Authored plugin source uses ESM imports, and `mvmnt-plugin build`
produces the CommonJS archive entry format required by MVMNT's host-injected loader. Direct ESM
archive execution, network/storage permissions, or a stronger isolation model require a separately
reviewed loader design.

SDK 1 bundles are not accepted. Authors with legacy source should follow the
[SDK 1 to SDK 2 migration guide](migration-v1-to-v2.md) and rebuild it.

# Plugin SDK compatibility

SDK 2 is pre-release and has not yet been published as a stable MVMNT plugin contract. Public
callbacks, DTOs, capabilities, and package layout may change when that produces a simpler current
design. New plugins should target the current SDK 2 surface only.

Once SDK 2 is released, the contract will follow semantic versioning. Additive DTO fields, helpers,
and optional capabilities will be minor changes; removals and callback or DTO incompatibilities
will require a new major version.

The public npm SDK is ESM-only. Authored plugin source uses ESM imports, and `mvmnt-plugin build`
produces the CommonJS archive entry format required by MVMNT's host-injected loader. Direct ESM
archive execution, network/storage permissions, or a stronger isolation model require a separately
reviewed loader design.

SDK 1 bundles are not accepted. Authors with legacy source should follow the
[SDK 1 to SDK 2 migration guide](migration-v1-to-v2.md) and rebuild it.

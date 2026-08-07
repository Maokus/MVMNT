# Plugin SDK compatibility policy

SDK 2 is currently pre-release and has not been published as a stable MVMNT plugin contract. Its public API,
callbacks, DTOs, and package layout may change when doing so simplifies the current design. New source plugins
should target the current SDK 2 surface only; SDK 1 remains unsupported.

The SDK contract will follow semantic versioning once SDK 2 is released. At that point, additive DTO fields,
helpers, and optional capabilities will be minor changes, while removals or callback/DTO incompatibilities will
require a new major version.

CJS output remains the only executable plugin format in 2.0. ESM execution, network/storage
permissions, and stronger sandboxing require a separate security-reviewed loader change.

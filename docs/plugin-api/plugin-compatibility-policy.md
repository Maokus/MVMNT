# Plugin SDK compatibility policy

MVMNT accepts SDK `^2.x` plugins. SDK 1 support was removed as a breaking host change in the
SDK 2-only release; installed SDK 1 archives must be migrated and rebuilt before they can load.

SDK 2 follows semantic versioning. Additive DTO fields, helpers, and optional capabilities are
minor changes. Contract removals or callback/DTO incompatibilities require a new major version.
Future contract removals follow the same major-release and migration-window policy.

CJS output remains the only executable plugin format in 2.0. ESM execution, network/storage
permissions, and stronger sandboxing require a separate security-reviewed loader change.

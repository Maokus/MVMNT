# Plugin SDK compatibility policy

MVMNT currently accepts the frozen `^1.x` compatibility line and SDK `^2.x`. The plugin's
`apiVersion` selects its runtime module map; it is not compared with one global version constant.

SDK 2 follows semantic versioning. Additive DTO fields, helpers, and optional capabilities are
minor changes. Contract removals or callback/DTO incompatibilities require a new major version.
V1 removal requires a separately announced major-release decision and migration window.

CJS output remains the only executable plugin format in 2.0. ESM execution, network/storage
permissions, and stronger sandboxing require a separate security-reviewed loader change.

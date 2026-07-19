# Frozen SDK 1 plugin bundles

The single archive in this directory is a compatibility fixture only. It is deliberately kept outside `dist/` so
they cannot be mistaken for current distributables. The loader tests use frozen SDK 1 bundles to
verify the announced compatibility window, including the local backup and warning path.

Do not add another fixture without an API-compatibility review. New plugin source must target SDK 2.

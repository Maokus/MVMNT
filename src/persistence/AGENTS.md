# Persistence Module Notes

- Keep fixtures and tests aligned: the baseline scene lives in `__fixtures__/baseline`. Update both fixture data and helper builders when behavior changes.
- Preserve scene migrations when they are small, isolated, and covered by a regression fixture. They protect existing projects even while 0.16 remains pre-release.
- Prefer simplifying the current export shape over adding new compatibility branches. Remove a migration only when its retained scene version is intentionally no longer supported, along with its fixture and test.
- A persisted-field change needs an export/import regression test; add an undo/rollback check when the field participates in scene snapshots.
- Comments should document the live export/import contract. Avoid speculative language about future phases.
- New validation rules must ship with regression coverage in `__tests__` and, when applicable, fixture updates.

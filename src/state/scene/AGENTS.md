# Scene Domain Notes

- Prefer high-level helpers like `dispatchSceneCommand` and selector factories when interacting with the scene store.
- Test suites should focus on observable store behavior (export snapshots, macro indices, runtime adapters) and avoid referencing historical rollout phases.
- Keep fixtures synchronized with the persistence baseline to avoid subtle drift between stores and persistence tests.

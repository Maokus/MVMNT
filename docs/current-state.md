# Current development state

## Release status

MVMNT 0.16 is in active pre-release development. The version in `package.json`, changelog entry, and scene schema
identify the next release target; they do not establish a released compatibility promise.

The MVMNT Plugin SDK 2.2 is a published public contract. It follows semantic versioning independently
of the pre-release MVMNT application. Breaking SDK changes require a new major version.

## Compatibility decisions

- Preserve the published SDK 2 contract. Additive APIs use minor releases, compatible fixes use patch
  releases, and breaking changes require a new major release.
- Keep scene migrations when they are compact and fixture-tested. Existing scenes are valuable project data, and the
  migration pipeline already isolates most compatibility cost from current runtime code.
- Prefer changing the current scene export shape over adding a second contemporary format. If support for an older
  scene version is deliberately dropped, remove its migration, fixture, and tests together.
- Timeline timing is the current tempo and meter authority. Legacy tempo and meter fields in scene settings are read
  during migration but are not written into new documents. Timeline row height and tempo-lane visibility are UI
  preferences and are likewise not written into new documents.
- Simulation readiness is runtime-only. Preview placeholders and last-complete-frame stabilization are neither
  persisted nor included in undo history, and exports continue to require exact prepared frames.
- Before the MVMNT 0.16 application release, review this policy, freeze the scene schema, publish its
  support window, and update the compatibility policy to reflect the application release commitment.

## Contributor expectations

For a scene, plugin, or persistence change, use the closest domain `AGENTS.md`, retain the relevant regression
fixtures, and run the repository verification commands from the root instructions.

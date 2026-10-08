# Current compatibility state

## Release status

MVMNT 0.16 is the stable desktop release line. The root `package.json` identifies the application version;
the exported `.mvt` scene schema has its own version. The current export schema is 10. Import supports schema
versions 1 through 10 through the retained migrations and fixtures.

The MVMNT Plugin SDK 2.2 is a published public contract. It follows semantic versioning independently
of the MVMNT application. Breaking SDK changes require a new major version.

## Compatibility decisions

- Preserve the published SDK 2 contract. Additive APIs use minor releases, compatible fixes use patch
  releases, and breaking changes require a new major release.
- Preserve import support for schema versions 1 through 10 throughout the 0.16 release line. Changes to exported
  scene data require a new schema version, a migration, and fixture-backed import tests. Do not silently drop an
  older version within the release line.
- Timeline timing is the current tempo and meter authority. Legacy tempo and meter fields in scene settings are read
  during migration but are not written into new documents. Timeline row height and tempo-lane visibility are UI
  preferences and are likewise not written into new documents.
- Simulation readiness is runtime-only. Preview placeholders and last-complete-frame stabilization are neither
  persisted nor included in undo history, and exports continue to require exact prepared frames.

## Contributor expectations

For a scene, plugin, or persistence change, use the closest domain `AGENTS.md`, retain the relevant regression
fixtures, and run the repository verification commands from the root instructions.

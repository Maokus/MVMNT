# Current development state

## Release status

MVMNT 0.16 is in active pre-release development. The version in `package.json`, changelog entry, and scene schema
identify the next release target; they do not establish a released compatibility promise.

The MVMNT Plugin SDK 2 is also pre-release and not yet published as a stable public contract. Agents and
contributors may make breaking SDK 2 changes when that produces a simpler, more coherent current design.

## Compatibility decisions

- Prefer one current SDK 2 pattern. Do not add shims for superseded SDK 2 APIs unless a supported consumer requires one.
- Keep scene migrations when they are compact and fixture-tested. Existing scenes are valuable project data, and the
  migration pipeline already isolates most compatibility cost from current runtime code.
- Prefer changing the current scene export shape over adding a second contemporary format. If support for an older
  scene version is deliberately dropped, remove its migration, fixture, and tests together.
- Timeline timing is the current tempo and meter authority. Legacy tempo and meter fields in scene settings are read
  during migration but are not written into new documents. Timeline row height and tempo-lane visibility are UI
  preferences and are likewise not written into new documents.
- Before release, review this policy, freeze the SDK and scene schema, publish the support window, and update the
  compatibility policy to reflect the release commitment.

## Contributor expectations

For a scene, plugin, or persistence change, use the closest domain `AGENTS.md`, retain the relevant regression
fixtures, and run the repository verification commands from the root instructions.

# State Management Guidelines

- Zustand stores are the single source of truth; tests should exercise public hooks/command gateways instead of internal mutations.
- UI code must not directly mutate persistent scene or timeline state; route persistent changes through the relevant command gateway.
- Before adding a global keyboard handler, find the command domain's existing owner. One command must have one global owner.
- Never assemble an undo or rollback snapshot by selecting individual state fields; use the canonical domain snapshot/export helper.
- Keep terminology neutral—refer to suites or behaviors instead of migration phases when describing tests.
- When modifying selectors or command gateways, update affected acceptance, fuzz, and integration tests in the nearby `__tests__` directories.

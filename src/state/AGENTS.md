# State Management Guidelines

- Zustand stores are the single source of truth; tests should exercise public hooks/command gateways instead of internal mutations.
- Keep terminology neutral—refer to suites or behaviors instead of migration phases when describing tests.
- When modifying selectors or command gateways, update affected acceptance, fuzz, and integration tests in the nearby `__tests__` directories.

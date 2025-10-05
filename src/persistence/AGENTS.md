# Persistence Module Notes

- Keep fixtures and tests aligned: the baseline scene lives in `__fixtures__/baseline`. Update both fixture data and helper builders when behavior changes.
- Comments should document the live export/import contract. Avoid speculative language about future phases.
- New validation rules must ship with regression coverage in `__tests__` and, when applicable, fixture updates.

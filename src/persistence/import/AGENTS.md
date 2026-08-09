# Scene Import Ownership

- `../import.ts` is the public orchestration facade. It sequences capabilities and owns user-facing progress, but should not implement parsing, migration, hydration, or application details.
- `contracts.ts` owns shared parsed-artifact, warning, option, and validated-document boundary types.
- `parseArtifact.ts` parses packages; `migrationOrchestration.ts` validates and migrates; hydration modules restore their named asset domain; `documentApplication.ts` is the only final store-application boundary.
- Dependencies flow from the facade into capability modules. Capability modules must not import the facade.
- Verify focused changes with `npm run test:persistence` and run the root verification suite before handoff.

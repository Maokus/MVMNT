# Timeline State Ownership

- `../timelineStore.ts` is the compatibility hook and composes capability creators. New action bodies belong in this directory.
- `transportTiming.ts` owns transport and tempo behavior; track and clip commands own persistent track/clip mutations; `viewState.ts` owns viewport/playback-range normalization; `persistenceAdapter.ts` owns canonical timeline persistence shaping.
- Persistent UI mutations go through `commandGateway.ts`. Do not create a second command or shortcut owner.
- Capability creators must be constructible with explicit `set`, `get`, and service dependencies so their contract tests do not require application startup wiring.
- Verify focused changes with `npm run test:timeline` and run the root verification suite before handoff.

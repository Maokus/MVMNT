# Timeline Command Gateway Plan v2

## Status

- Revised plan incorporating resolved questions and new safeguards
- Serialized descriptor facade (`dispatchTimelineCommandDescriptor`) exposes the gateway to scripting
- Timeline store/UI callers now route mutations through command dispatches and reuse gateway telemetry validation

## Goals

- Provide a consistent undo/redo story for timeline mutations by routing them through a command gateway mirroring the existing scene flow.
- Preserve existing telemetry hooks and extend them to cover timeline interactions without duplicating instrumentation.

## Background

- Approach 1 from [Timeline Undo Options](./timeline-undo-options.md) recommends wrapping timeline mutations in command objects that produce undo/redo patches.
- The current undo controller (see [Store State and Undo Overview](../docs/STATE_AND_UNDO.md)) listens for scene command patches; we will extend this to the timeline domain.
- Decisions clarified in this revision:
  - Timeline commands will emit granular patches so downstream consumers can continue to diff individual track changes.
  - Scripting integrations will call the gateway through a serialized command descriptor API rather than invoking the store directly.

## Architecture Overview

1. **Gateway Wrapper**
    - Implement a `createTimelineCommandGateway` factory that accepts the timeline store and returns an object with `dispatch(commandDescriptor)`.
    - Each command exposes `execute`, `undo`, and `redo` methods returning patch payloads compatible with the shared undo controller.
    - The gateway is responsible for invoking commands, emitting telemetry, and forwarding patches to the undo controller listener.
    - Provide a scripting facade that resolves serialized descriptors into command instances before dispatch.

2. **Command Definitions**
    - Start with high-value mutations (`removeTracks`, `addTrack`, `setTrackOffsetTicks`).
    - Commands encapsulate validation and normalization of payloads to shield callers from store details.
    - Store mutations move inside `execute` to centralize async handling and reduce race conditions when commands become asynchronous.
    - Commands must emit granular patches per track even when invoked as batch operations.

3. **Undo Controller Integration**
    - Extend the existing patch-based controller with a `subscribeTimeline` hook mirroring the scene subscription API.
    - Ensure patches carry enough metadata (e.g., action type, affected track ids) so UI components can display undo labels consistently.
    - Namespace patch action identifiers (e.g., `timeline/ADD_TRACK`) so telemetry and undo consumers can distinguish domains unambiguously.
    - Align telemetry events with the existing scene command schema for easier aggregation.

4. **Execution Ordering Policy**
    - Gateway dispatch queues commands when an `execute` call returns a pending promise; subsequent commands wait until completion unless explicitly marked concurrent-safe.
    - Provide an optional `mode` flag (`"serial" | "concurrent"`) on command definitions to signal whether the gateway can overlap execution.
    - Document that callers should `await gateway.dispatch` to respect ordering guarantees.

5. **Telemetry and Validation**
    - Map each command to a telemetry event name and undo label string in a central registry to avoid string drift.
    - Add a lightweight schema validation step that asserts telemetry payloads match the scene schema before emission.
    - Emit warnings when legacy paths attempt to emit duplicate telemetry outside the gateway.

6. **Consumer Migration**
    - Introduce the gateway alongside the current direct store access.
    - Migrate callers incrementally by replacing direct store mutations with command dispatches.
    - Provide temporary adapters for complex flows (e.g., transport gestures) to reduce churn while commands are rolled out.
    - Expose the serialized command descriptor API to scripting and automation layers and log usage to confirm migration coverage.

## Implementation Steps

1. **Scaffold Gateway Infrastructure**
    - Define TypeScript interfaces for `TimelineCommand`, `TimelineCommandContext`, patch payloads, and serialized command descriptors.
    - Create the gateway factory and wire it to the undo controller through a dedicated subscription channel.
    - Implement the execution ordering queue with serial-by-default behavior.
    - Document gateway lifecycle hooks (init, teardown) so tests and scripting callers can boot deterministic instances.

2. **Implement Foundational Commands**
    - Move `addTrack` and `removeTracks` logic into commands, returning the resulting granular patches.
    - Support async execution so future commands (e.g., file imports) can await IO before mutating state.
    - Populate the command registry with telemetry labels and execution mode metadata.

3. **Telemetry, Patch Domains, and Labeling**
    - Namespace patch action types with a `timeline/` prefix and update consumers to read the new identifiers.
    - Map each command to telemetry events and undo labels in the central registry.
    - Add a contract test to confirm telemetry payloads conform to the shared schema.

4. **Scripting Gateway Exposure**
    - Implement a small API that accepts serialized command descriptors, resolves them into command instances, and returns standardized results (patches + metadata).
    - Provide examples and usage documentation for scripting consumers.

5. **Caller Migration Guide** *(Status: Complete — timeline store helpers now issue command dispatches and UI handlers were updated to call the async adapters.)*
    - Document the migration pattern: import the gateway, construct command instances (or descriptors), and dispatch.
    - Provide lint or type guards (e.g., deprecate direct store methods) once the gateway covers most mutations.
    - Track migration progress in a checklist and add runtime assertions when known direct mutations occur outside the gateway.

6. **Testing Strategy** *(Status: Complete — new command coverage verifies property updates, reordering, and telemetry schema checks.)*
    - Add unit tests for commands validating that `execute`/`undo`/`redo` apply the correct granular patches.
    - Extend integration tests to confirm undo/redo stacks remain consistent across scene and timeline domains.
    - Add tests for the execution ordering queue and serialized descriptor API.

## Serialized Command Descriptor Draft

- **Shape**
  - `type`: canonical command identifier (e.g., `"timeline.addTrack"`).
  - `version`: semantic version for descriptor evolution; callers must supply `1` initially.
  - `payload`: JSON-serializable data passed to the command factory; command definitions validate and normalize it.
  - `options`: optional execution hints (e.g., `{ mode: "concurrent" }`) that mirror the command metadata defaults.
- **Resolution Flow**
  - Gateway facade looks up the command constructor by `type` and rejects unknown or deprecated versions with structured errors.
  - Descriptors execute inside the same queue as imperative command instances to guarantee ordering.
  - Responses include `patches`, `undoLabel`, `telemetryEvent`, and any command-specific `result` metadata for scripting consumers.
- **Validation**
  - Add zod-based schema validation at the facade boundary and emit telemetry when descriptors are rejected.
  - Record accepted descriptors in a rolling log for migration analytics.

## Telemetry and Validation Addendum

- Central registry couples command identifiers with telemetry event names, undo labels, and feature flags controlling preview rollout.
- Telemetry payload schema mirrors the scene command schema; add a shared helper to assert parity at runtime and in tests.
- Emit a `timeline_command_gateway` heartbeat event containing execution counts, queue depth, and error rates for observability.
- Provide a redaction utility ensuring that user-generated track names are scrubbed before telemetry submission when privacy mode is enabled.

## Execution Checklist

- [x] Land gateway scaffolding with queue, telemetry validation helper, and undo subscription wiring.
- [x] Implement `addTrack` and `removeTracks` commands plus granular patch emission tests.
- [x] Ship serialized descriptor facade behind a feature flag for scripting consumers.
- [x] Update timeline UI callers to use the gateway via thin adapters and remove direct store mutations.
- [ ] Enable telemetry heartbeat and verify dashboards capture timeline command traffic.
- [ ] Publish migration guide in `/docs` and cross-link from scripting docs once facade is stable.

## Risks and Mitigations

- **Async vs Sync Mutations**
    - *Mitigation*: Type signatures return `Promise<void>` and documentation stresses awaiting `dispatch`. Serial queueing prevents state races.
- **Patch Shape Divergence**
    - *Mitigation*: Define shared patch type utilities, namespace action identifiers, and add schema tests to ensure parity.
- **Telemetry Duplication**
    - *Mitigation*: Centralize telemetry emission in the gateway, validate payloads, and log warnings for legacy paths.
- **Partial Migration State**
    - *Mitigation*: Track migration progress, add runtime assertions for direct mutations, and use migration checklist.
- **Naming Overlap**
    - *Mitigation*: Adopt a naming convention (`RemoveTracksCommand`) and document it in the command registry.

## Next Actions

- Finalize the serialized command descriptor format and document it for scripting consumers.
- Land gateway scaffolding with execution queue and telemetry validation.
- Begin migrating `addTrack` and `removeTracks` callers using the new granular patch commands.

# Timeline Command Gateway Plan

## Status

-   Draft Plan

## Goals

-   Provide a consistent undo/redo story for timeline mutations by routing them through a command gateway mirroring the existing scene flow.
-   Preserve existing telemetry hooks and extend them to cover timeline interactions without duplicating instrumentation.

## Background

-   Approach 1 from [Timeline Undo Options](./timeline-undo-options.md) recommends wrapping timeline mutations in command objects that produce undo/redo patches.
-   The current undo controller (see [Store State and Undo Overview](../docs/STATE_AND_UNDO.md)) listens for scene command patches; we will extend this to the timeline domain.

## Architecture Overview

1. **Gateway Wrapper**

    - Implement a `createTimelineCommandGateway` factory that accepts the timeline store and returns an object with `dispatch(command)`.
    - Each command exposes `execute`, `undo`, and `redo` methods returning patch payloads compatible with the shared undo controller.
    - The gateway is responsible for invoking commands, emitting telemetry, and forwarding patches to the undo controller listener.

2. **Command Definitions**

    - Start with high-value mutations (`removeTracks`, `addTrack`, `setTrackOffsetTicks`).
    - Commands encapsulate validation and normalization of payloads to shield callers from store details.
    - Store mutations move inside `execute` to centralize async handling and reduce race conditions when commands become asynchronous.

3. **Undo Controller Integration**

    - Extend the existing patch-based controller with a `subscribeTimeline` hook mirroring the scene subscription API.
    - Ensure patches carry enough metadata (e.g., action type, affected track ids) so UI components can display undo labels consistently.
    - Align telemetry events with existing scene command schema for easier aggregation.

4. **Consumer Migration**
    - Introduce the gateway alongside the current direct store access.
    - Migrate callers incrementally by replacing direct store mutations with command dispatches.
    - Provide temporary adapters for complex flows (e.g., transport gestures) to reduce churn while commands are rolled out.

## Implementation Steps

1. **Scaffold Gateway Infrastructure**

    - Define TypeScript interfaces for `TimelineCommand`, `TimelineCommandContext`, and patch payloads.
    - Create the gateway factory and wire it to the undo controller through a dedicated subscription channel.

2. **Implement Foundational Commands**

    - Move `addTrack` and `removeTracks` logic into commands, returning the resulting patches.
    - Support async execution so future commands (e.g., file imports) can await IO before mutating state.

3. **Telemetry + Labeling**

    - Map each command to a telemetry event name and undo label string in a central registry to avoid string drift.
    - Ensure undo history entries display timeline-specific context (e.g., track names) when available.

4. **Caller Migration Guide**

    - Document the migration pattern: import the gateway, construct command instances, and dispatch.
    - Provide lint or type guards (e.g., deprecate direct store methods) once the gateway covers most mutations.

5. **Testing Strategy**
    - Add unit tests for commands validating that `execute`/`undo`/`redo` apply the correct patches.
    - Extend integration tests to confirm undo/redo stacks remain consistent across scene and timeline domains.

## Potential Developer Confusion & Mitigations

-   **Async vs Sync Mutations**: Developers may assume commands run synchronously because current mutations do.
    -   _Mitigation_: Type signatures return `Promise<void>` and documentation stresses awaiting `dispatch`.
-   **Patch Shape Divergence**: Scene and timeline patches might diverge, leading to incompatible undo handling.
    -   _Mitigation_: Define shared patch type utilities and add schema tests to ensure parity.
-   **Telemetry Duplication**: Without guidance, teams could emit telemetry both in commands and legacy callers.
    -   _Mitigation_: Centralize telemetry emission in the gateway and mark legacy paths as deprecated with console warnings during transition.
-   **Partial Migration State**: Mixed command/direct mutations could result in missing undo entries.
    -   _Mitigation_: Track migration progress in a checklist and add runtime assertions when known direct mutations occur outside the gateway.
-   **Naming Overlap**: Similar command names (`RemoveTrack` vs `RemoveTracks`) can confuse usage.
    -   _Mitigation_: Adopt a naming convention (`RemoveTracksCommand`) and document it in the command registry.

## Open Questions

-   Should timeline commands emit granular patches per track or aggregate operations for performance?
-   How will we expose the gateway to scripting or automation layers that currently call the store directly?

## Open question answers

-   Timeline commands should emid granular patches.
-   Expose the timeline gateway to scripting via a small scripting API that accepts serialized command descriptors (not raw store calls) and returns standardized results (patches + metadata).

## Recommendations

-   Add Execution Ordering Policy (Explicitly define how async commands queue or block)
-   Telemetry Schema Validation (Add a simple contract test ensuring telemetry payloads conform to the same shape as scene telemetry)
-   Formalize Patch Domains (Prefix or namespace patch actions (timeline/ADD_TRACK, scene/ADD_OBJECT) so undo controller and telemetry can distinguish sources unambiguously.)

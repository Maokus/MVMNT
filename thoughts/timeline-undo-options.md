# Timeline Undo Options

## Status
- Open Questions

## Context
- See [Store State and Undo Overview](../docs/STATE_AND_UNDO.md) for the current scene-focused undo flow.
- Timeline mutations (e.g., `removeTracks`, `setTrackOffsetTicks`) bypass the scene command gateway and do not emit undo patches.

## Approaches

### 1. Command Gateway for Timeline Actions
- Introduce a `dispatchTimelineCommand` wrapper that mirrors the scene gateway structure.
- Each command defines `undo` / `redo` patches so the existing patch-based controller can subscribe via a new listener.
- Pros: aligns mental model with scene undo and enables telemetry; Cons: requires refactoring all timeline callers to async command APIs.

### 2. Patch Capture Middleware
- Decorate the timeline store creator to diff state snapshots before and after mutations and record granular patches.
- Provide a `mergeKey` hint in action payloads so gestures (drag-to-move, marquee delete) collapse into single undo entries.
- Pros: minimal churn to action signatures; Cons: diffing large track maps may be expensive without structural sharing helpers.

### 3. Snapshot Ring Buffer
- Capture serialized timeline slices on each mutation using a capped history buffer stored alongside transport metadata.
- `undo()` restores the previous snapshot through a dedicated hydrate helper rather than replaying command patches.
- Pros: straightforward to implement and resilient to side effects; Cons: snapshots can be heavy and make targeted redo merges difficult.

## Next Steps
- Prototype the command gateway approach with track add/remove to validate telemetry parity and performance.
- Measure memory impact of snapshot buffering before considering a hybrid solution.

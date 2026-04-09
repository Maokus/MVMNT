# Automation System

The automation system adds a third property binding type — `'keyframes'` — that lets users animate any numeric, color, or boolean element property over time. Phases 1–7 are complete as of schema version 5.

---

## Architecture

### Binding Precedence

When a property is evaluated at render time, precedence is:

```
automation (keyframe evaluation) → macro modifier (additive/multiplicative) → constant fallback
```

This ordering lets macro adjustments sit on top of automation without requiring duplicated channels.

### Data Model (`src/automation/types.ts`)

```typescript
interface AutomationKeyframe {
    tick: number;
    value: unknown;          // number | string (hex color) | boolean
    easingId: string;        // key into src/math/animation/easing.ts
}

interface AutomationChannel {
    id: string;              // `${elementId}.${propertyKey}`
    elementId: string;
    propertyKey: string;
    keyframes: AutomationKeyframe[];  // sorted ascending by tick
    interpolation: 'linear' | 'stepped' | 'eased';
    valueType: 'number' | 'color' | 'boolean';
}

interface AutomationState {
    channels: Record<string, AutomationChannel>;
}

interface KeyframesBindingState {
    type: 'keyframes';
    channelId: string;
}
```

Channel IDs are generated via `makeChannelId(elementId, propertyKey)` and parsed back with `parseChannelId`. Factory helpers (`createChannel`, `insertKeyframeSorted`, `cloneChannel`) enforce invariants.

### Curve Evaluation (`src/automation/`)

| File | Purpose |
|------|---------|
| `automation-curve.ts` | Evaluates a channel at a tick: binary search for segment, applies easing to `t` parameter |
| `color-interpolation.ts` | `parseColor` / `formatColor` / `lerpColor` for hex colors |
| `automation-evaluator.ts` | Singleton `AutomationEvaluator` with lazy curve cache per channel; `invalidateChannel` / `invalidateAll` on state changes |

Evaluation rules:
- **Number:** lerp with easing applied to `t`
- **Color:** decompose to RGBA, lerp each component, recompose
- **Boolean / stepped:** hold value until next keyframe
- Before first keyframe: hold first value. After last: hold last value.

Easing functions come from `src/math/animation/easing.ts` (30+ presets) referenced by `easingId` string key.

### Binding System (`src/bindings/`)

`KeyframeBinding<T>` extends `PropertyBinding<T>`:
- `getValueWithContext(context)` converts `context.targetTime` (seconds) to ticks via `TimingManager.secondsToTicks()`, then delegates to the evaluator
- `getValue()` evaluates at current timeline tick (fallback path)
- `setValue()` is a no-op — edits go through scene commands

`src/core/scene/elements/base.ts` maintains `_keyframeBoundKeys: Set<string>` and invalidates the property cache for all keyframe-bound properties on every `buildRenderObjects` call (required because values are time-dependent).

### Scene Commands (`src/state/scene/commandGateway.ts`)

| Command | Purpose |
|---------|---------|
| `enablePropertyAutomation` | Create channel, set binding to `'keyframes'`, optionally seed with initial keyframe |
| `disablePropertyAutomation` | Remove channel, revert to constant at current tick value |
| `addKeyframe` | Insert/replace keyframe at a tick |
| `removeKeyframe` | Remove keyframe at a tick |
| `updateKeyframe` | Patch value or easingId at a tick |
| `moveKeyframe` | Change a keyframe's tick position |
| `batchUpdateKeyframes` | Replace all keyframes in a channel (bulk ops) |

All commands have undo inverses in `buildSceneCommandPatch()`. Drag operations use merge keys (`kf-drag:${channelId}:${sessionId}`) to collapse continuous drags into a single undo entry.

### Property Panel UI

`KeyframeControl.tsx` renders a diamond-shaped toggle per automatable property row with three visual states:
- **inactive** (no automation): dimmed fill
- **automated** (channel exists, no keyframe at tick): outlined diamond
- **active** (keyframe at current tick): solid fill

Click adds/removes a keyframe at the current tick. Right-click opens a context menu (add/remove, remove all, easing picker, navigate prev/next).

`ElementPropertiesPanel.tsx` routes property edits through `addKeyframe` when the property is automated, instead of `updateElementConfig`.

### Persistence

Automation channels are serialized under the `automation` key in the scene envelope. Schema version bumped from 4 → 5. Old scenes load with empty automation state. New scenes in old versions silently ignore `'keyframes'` bindings (properties fall back to schema defaults).

---

## Key File Map

| File | Role |
|------|------|
| `src/automation/types.ts` | All automation types and ID utilities |
| `src/automation/automation-curve.ts` | Per-channel curve evaluator |
| `src/automation/automation-evaluator.ts` | Singleton evaluator with cache |
| `src/automation/color-interpolation.ts` | Hex color interpolation |
| `src/automation/hooks.ts` | `useAutomationChannel`, `useKeyframeAtTick`, `useCurrentTick` |
| `src/bindings/keyframe-binding.ts` | `KeyframeBinding<T>` class |
| `src/workspace/panels/properties/KeyframeControl.tsx` | Diamond toggle UI |
| `src/state/sceneStore.ts` | `AutomationState` slice, store actions |
| `src/state/scene/commandGateway.ts` | 7 automation scene commands |
| `src/core/scene/elements/base.ts` | `'keyframes'` binding detection, per-frame cache invalidation |
| `src/state/scene/runtimeAdapter.ts` | Automation change detection, evaluator cache invalidation |

Path alias `@automation/*` resolves to `src/automation/` (configured in `tsconfig.json` and `vite.config.ts`).

---

## Developer Notes

**Adding a new automatable property type:** The `valueType` field on `AutomationChannel` controls how the curve evaluator interpolates. Currently supported: `'number'`, `'color'`, `'boolean'`. Adding `'vector'` or `'string'` would require a new interpolation branch in `automation-curve.ts`.

**Channel ID collisions:** Shared channel IDs are a distinct concept from per-property channels. Always use `makeChannelId` / `parseChannelId` factory helpers rather than constructing IDs by hand.

**Undo coalescing:** Drag interactions must pass a `mergeKey` to `moveKeyframe` or `updateKeyframe` to avoid flooding the undo stack. Use the pattern `kf-drag:${channelId}:${sessionId}` where `sessionId` is a stable ID for the current pointer-down session.

**Timeline state drift:** Automation UI state (`automationExpandedElements`, `automationExpandedCurves`, `automationSelectedKeyframes`) lives in `SceneInteractionState` in `sceneStore`, not in component state. Use `src/automation/selectors.ts` selectors to derive view models.

---

## See Also

- [Timeline Automation Lanes Plan](./timeline-lanes-plan.md) — Phase 8: visual dope-sheet and curve editor in the timeline panel
- `src/automation/__tests__/` — unit tests for curve evaluation, evaluator cache, and binding serialization

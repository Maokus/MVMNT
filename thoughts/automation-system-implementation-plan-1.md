Here is Claude's plan:

# Automation System — Implementation Plan

## Context

MVMNT currently supports two property binding types: `constant` (static value) and `macro` (shared variable). There is no way to change element properties over time. This plan adds a **keyframe automation** system — the third binding type `'keyframes'` — that lets users animate any numeric, color, or boolean property along the timeline.

The existing `getValueWithContext(context)` pattern on `PropertyBinding` and the `targetTime`-based render loop mean most infrastructure already supports time-varying values. The main work is: data model, curve evaluation, a new `KeyframeBinding` class, scene commands for CRUD, and property panel UI to create/edit keyframes.

---

## Phase 1: Data Model & Core Types

**New file:** `src/automation/types.ts`

```typescript
interface AutomationKeyframe {
    tick: number;              // timeline tick position
    value: unknown;            // number | string(hex color) | boolean
    easingId: string;          // key into easing library ('linear', 'easeInOutCubic', etc.)
}

interface AutomationChannel {
    id: string;                // `${elementId}.${propertyKey}`
    elementId: string;
    propertyKey: string;
    keyframes: AutomationKeyframe[];  // sorted by tick asc
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

Utility functions: `makeChannelId`, `parseChannelId`, `createChannel`, `insertKeyframeSorted`, `cloneChannel`.

**Modify:** `tsconfig.json` — add `@automation/*` path alias
**Modify:** `vite.config.ts` — add corresponding Vite alias

**Modify:** `src/state/sceneStore.ts`
- Extend `BindingState = ConstantBindingState | MacroBindingState | KeyframesBindingState`
- Add `automation: AutomationState` to `SceneStoreState`
- Add store actions: `setAutomationChannel`, `removeAutomationChannel`, `updateAutomationKeyframes`
- Update `clearScene`, `removeElement`, `duplicateElement`, `updateElementId` to manage automation channels
- Update `exportSceneDraft` / `importScene` to include automation data

**Modify:** `src/bindings/property-bindings.ts`
- Add `'keyframes'` to `BindingType`
- Extend `PropertyBindingData` union with `{ type: 'keyframes'; channelId: string }`
- Update `PropertyBinding.fromSerialized()` to construct `KeyframeBinding`

---

## Phase 2: Curve Evaluator

**New file:** `src/automation/automation-curve.ts`
- `AutomationCurve` class that evaluates a channel at a given tick
- Binary search for segment lookup (keyframes sorted by tick)
- Numeric: lerp between adjacent keyframes with easing applied to `t` parameter
- Boolean: always stepped (hold until next keyframe)
- Color: decompose hex to RGB(A) components, lerp each, recompose
- Before first keyframe: hold first value. After last: hold last value.

**New file:** `src/automation/color-interpolation.ts`
- `parseColor(hex) → [r,g,b,a]`, `formatColor(rgba) → hex`, `lerpColor(a, b, t) → hex`

**New file:** `src/automation/automation-evaluator.ts`
- Singleton `AutomationEvaluator` with lazy curve cache per channel
- `evaluate(channelId, tick) → value`
- `invalidateChannel(channelId)` / `invalidateAll()` for cache management
- Reads channel data from `useSceneStore.getState().automation.channels`

**Reuse:** `src/math/animation/easing.ts` — the 30+ easing functions are used directly as `easingId` lookups.

---

## Phase 3: Binding System Extension

**New file:** `src/bindings/keyframe-binding.ts`

```typescript
class KeyframeBinding<T> extends PropertyBinding<T> {
    constructor(channelId: string);
    getValue(): T;                                    // fallback: evaluate at current timeline tick
    getValueWithContext(context: PropertyBindingContext): T;  // evaluate at render targetTime
    setValue(_value: T): void;                         // no-op (edits go through commands)
    serialize(): PropertyBindingData;
}
```

`getValueWithContext` converts `context.targetTime` (seconds) to ticks via `TimingManager.secondsToTicks()`, then delegates to `automationEvaluator.evaluate()`.

**Modify:** `src/core/scene/elements/base.ts`
- In `_applyConfig` (line 1050): add `value.type === 'keyframes'` to the binding detection condition, construct `KeyframeBinding`
- Add `_keyframeBoundKeys: Set<string>` — populated in `_applyConfig`, cleared when binding changes away from keyframes
- In `buildRenderObjects` (line 543, after setting `_renderContext`): invalidate cache for all keyframe-bound properties:
  ```typescript
  for (const key of this._keyframeBoundKeys) {
      this._cacheValid.set(key, false);
  }
  ```
  This is necessary because the cached value from the previous frame is stale — the value is time-dependent.

**Modify:** `src/state/scene/runtimeAdapter.ts`
- `buildConfigPayload()`: handle `binding.type === 'keyframes'` — pass through as `{ type: 'keyframes', channelId }`
- `bindingsSignature()`: include keyframes in signature generation
- `handleStateChange()`: detect automation state changes, invalidate evaluator cache, bump adapter version

---

## Phase 4: Scene Commands

**Modify:** `src/state/scene/commandGateway.ts` — add new `SceneCommand` variants:

| Command | Purpose |
|---------|---------|
| `enablePropertyAutomation` | Create channel, set binding to `keyframes`, optionally seed with initial keyframes (e.g. current constant value at tick 0) |
| `disablePropertyAutomation` | Remove channel, revert to constant binding (value at current tick or provided fallback) |
| `addKeyframe` | Insert/replace keyframe at a tick in a channel |
| `removeKeyframe` | Remove keyframe at a tick |
| `updateKeyframe` | Patch keyframe value/easing at a tick |
| `moveKeyframe` | Change a keyframe's tick position |
| `batchUpdateKeyframes` | Replace all keyframes in a channel (for bulk ops) |

Each command gets an undo inverse in `buildSceneCommandPatch()`. Drag operations use merge keys (`mergeKey: 'kf-drag:${channelId}:${sessionId}'`) to collapse into a single undo entry.

---

## Phase 5: Property Panel UI

**New file:** `src/workspace/panels/properties/KeyframeControl.tsx`
- Diamond-shaped toggle button per automatable property row
- Three states: no automation (dimmed), automation with keyframe at current tick (filled), automation without keyframe at current tick (outlined)
- Click: toggle keyframe at current tick. Right-click: context menu (add/remove keyframe, remove all, easing picker, nav to prev/next keyframe)

**New file:** `src/automation/hooks.ts`
- `useAutomationChannel(elementId, propertyKey)` — returns channel or null
- `useKeyframeAtTick(channelId, tick)` — returns keyframe or null
- `useCurrentTick()` — subscribes to timeline store for `currentTick`

**Modify:** `src/workspace/panels/properties/PropertyGroupPanel.tsx`
- Render `KeyframeControl` next to each automatable property (types: `number`, `range`, `boolean`, `color`, `colorAlpha`)
- The existing commented-out animation icon (lines ~423-430) can be replaced with this

**Modify:** `src/workspace/panels/properties/ElementPropertiesPanel.tsx`
- In `handleValueChange`: if property has automation, dispatch `addKeyframe` command (create/update keyframe at current tick) instead of `updateElementConfig`
- Pass automation context (channel map, current tick) to `PropertyGroupPanel`

---

## Phase 6: Tests

**New files:**
- `src/automation/__tests__/automation-curve.test.ts` — linear/stepped/eased interpolation, boundary conditions, color, boolean
- `src/automation/__tests__/automation-evaluator.test.ts` — cache hit/miss, invalidation, store integration
- `src/bindings/__tests__/keyframe-binding.test.ts` — getValue, getValueWithContext, serialization round-trip
- Integration test: element with keyframe binding produces different values at different `targetTime` values

---

## Phase 7: Serialization & Persistence

**Modify:** `src/state/sceneStore.ts` — `exportSceneDraft` includes `automation`, `importScene` hydrates it (already scoped in Phase 1)
**Modify:** Persistence layer (`src/persistence/`) — include `automation?` in scene envelope, validate on import, bump schema version from 4→5
**Backwards compat:** Old scenes load with empty automation state. New scenes in old versions silently ignore `keyframes` bindings (properties fall back to schema defaults).

---

## Phase 8 (Future): Timeline Automation Tracks

Not part of MVP. Outline:
- Per-property sub-rows under each element in timeline panel
- Dope-sheet view for keyframe placement (click to add, drag to move)
- Curve editor pane for visual easing control
- Beat-aligned snapping via `transport.quantize`
- Copy/paste channels between properties/elements

---

## Critical Files

| File | Changes |
|------|---------|
| `src/automation/types.ts` | **New** — all automation types |
| `src/automation/automation-curve.ts` | **New** — curve evaluator |
| `src/automation/automation-evaluator.ts` | **New** — singleton evaluator with cache |
| `src/automation/color-interpolation.ts` | **New** — hex color interpolation |
| `src/automation/hooks.ts` | **New** — React hooks for automation state |
| `src/bindings/keyframe-binding.ts` | **New** — KeyframeBinding class |
| `src/workspace/panels/properties/KeyframeControl.tsx` | **New** — diamond keyframe toggle UI |
| `src/bindings/property-bindings.ts` | Extend BindingType, PropertyBindingData, fromSerialized |
| `src/state/sceneStore.ts` | Add AutomationState, KeyframesBindingState, store actions, serialize/import/export |
| `src/state/scene/commandGateway.ts` | Add 7 new SceneCommand variants with undo |
| `src/core/scene/elements/base.ts` | Handle `'keyframes'` in _applyConfig, per-frame cache invalidation |
| `src/state/scene/runtimeAdapter.ts` | Handle keyframes in config payload, detect automation changes |
| `src/workspace/panels/properties/PropertyGroupPanel.tsx` | Add KeyframeControl per automatable property |
| `src/workspace/panels/properties/ElementPropertiesPanel.tsx` | Route edits through automation commands when automated |
| `tsconfig.json` / `vite.config.ts` | Add `@automation/*` path alias |

## Verification

1. **Typecheck:** `npx tsc --noEmit` — zero errors
2. **Unit tests:** Run automation curve/evaluator/binding tests
3. **Manual test:** Create an element → automate its opacity → add keyframes at different ticks → play timeline → verify opacity changes over time
4. **Undo test:** Add keyframe → undo → verify keyframe removed → redo → verify restored
5. **Serialization test:** Save scene with automation → reload → verify keyframes preserved
6. **Performance:** Profile render loop with 10+ automated properties to confirm no regression

## Phasing for Claude Code Sessions

This is a large feature. Recommended approach:
1. **Session 1:** Phases 1-2 (types + curve evaluator + tests)
2. **Session 2:** Phase 3 (binding system extension + base element changes)
3. **Session 3:** Phase 4 (scene commands with undo)
4. **Session 4:** Phases 5-6 (property panel UI + integration tests)
5. **Session 5:** Phase 7 (serialization/persistence)

Each session should end with `npx tsc --noEmit` passing. This keeps the codebase clean between sessions and lets you validate incrementally.



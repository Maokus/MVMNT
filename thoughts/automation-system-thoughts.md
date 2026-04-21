## Automation System — Improvement Plan

### Q1: Are automations property bindings? Expression system difficulty?

**Yes — automations are first-class binding variants.** The `BindingType` is `'constant' | 'macro' | 'keyframes'` and `KeyframeBinding` extends `PropertyBinding`. The discriminated union in `PropertyBindingData`, the `fromSerialized` factory, and `getValueWithContext` all extend cleanly to a new type.

**Adding an expression system is architecturally straightforward, with one significant design question:**

The additions would be:
1. New `BindingType`: `'expression'`
2. `ExpressionBindingData`: `{ type: 'expression'; source: string }`  
3. `ExpressionBinding` class extending `PropertyBinding`, implementing `getValueWithContext`
4. An expression evaluator (sandboxed JS via `Function(...)`, or a custom DSL)

The design question is **context richness**. Today `PropertyBindingContext` is just `{ targetTime, sceneConfig }`. Expressions in After Effects can reference other properties, audio features, etc. Before adding expressions you should decide what the context object exposes — e.g. `time`, `thisElement`, `audio`, `value` (the static/keyframe value before expression). That decision shapes the API more than the binding plumbing. Since `getValueWithContext` already passes context, you can expand `PropertyBindingContext` fields without touching the binding dispatch.

The `fromSerialized` factory in `property-bindings.ts:65` uses a `switch` — expressions need a case added there and a registered factory (same pattern as the keyframe factory at `property-bindings.ts:24`).

---

### Q2: Other improvements

#### 2a. Dead legacy fields (`easingId`, channel `interpolation`)

`createKeyframe` (types.ts:219) hardcodes `easingId: 'linear'`. The field is only read by the legacy evaluation path in `automation-curve.ts:202-213`, and `migrateAutomationState` converts all loaded data on the way in. The legacy path now exists only for newly-created keyframes that somehow lack `segmentInterpolation`, which `createKeyframe` ensures never happens.

**Improvement:** Remove `easingId` from `createKeyframe`'s output — default it to `''` or drop it (schema v7 bump). Mark `AutomationChannel.interpolation` as `@deprecated` more visibly, stop passing it through `createChannel`. The migration code stays to handle on-disk legacy data.

#### 2b. `makeChannelId` dot separator is fragile

`makeChannelId` is `${elementId}.${propertyKey}` and `parseChannelId` uses `indexOf('.')` — takes the **first** dot. If an `elementId` ever contains a dot, parsing breaks silently. Element IDs are likely UUIDs or short alphanumeric strings today, but it's a latent bug.

**Improvement:** Switch the separator to something that can't appear in IDs — `::` is the obvious choice. `parseChannelId` becomes `lastIndexOf('::')` or a split on `'::'`. One migration pass to rename all channel keys in the store on load.

#### 2c. `getValueWithContext` is optional on the base class

At `property-bindings.ts:50`: `getValueWithContext?(context: PropertyBindingContext): T` — declared optional. The callers that want time-aware evaluation must guard against `undefined`. This inconsistency means constant bindings silently fall back to `getValue()` via the caller, but the contract is invisible to TypeScript.

**Improvement:** Make it required on `PropertyBinding` with a default implementation on the base class that delegates to `getValue()`. `ConstantBinding` and `MacroBinding` get it for free; `KeyframeBinding` overrides it. Removes the `?.` dance at every callsite.

#### 2d. `validate.ts` doesn't cover automation

The scene envelope validator checks elements, timeline, assets — but nothing under `automation`. A malformed `channels` record passes validation and crashes at load time.

**Improvement:** Add a `validateAutomation` pass inside `validateSceneEnvelope`: confirm `automation.channels` is an object (if present), and spot-check each channel for `id`/`elementId`/`propertyKey` strings and `keyframes` array. Should be lightweight — no deep keyframe validation needed, just structural shape.

#### 2e. `AutomationEvaluatorImpl.resolveChannel` has a `require()` fallback

`automation-evaluator.ts:62-67`: if `setChannelProvider` is never called, it falls back to `require('@state/sceneStore')`. This silent fallback masks initialization order bugs and the `require()` is a dynamic CommonJS call inside an ESM project.

**Improvement:** Remove the fallback. Throw a clear error if `channelProvider` is null when `evaluate()` is called, or assert it is set in the constructor via a startup check. The provider is always wired at app init — the fallback is dead code in production.

#### 2f. Color bezier uses a t-mapping hack

`automation-curve.ts:177-189`: for `valueType === 'color'` in bezier mode, it evaluates a bezier to get a t-value and then lerps the color. The comment says "simpler than per-component bezier." This is correct in intent but the code still constructs prevVal/nextVal as `0` and `1` (fakes a unit bezier). It works but is confusing.

**Improvement:** Extract a helper `evaluateBezierT(localT, prev, next, handles)` that returns the remapped t, and use it for both color (lerp with bezierT) and numeric (full 2D bezier). Removes the fake value construction and makes the two paths clearly distinct.

#### 2g. `unwrapConstant` depth guard suggests a past serialization bug

`property-bindings.ts:68-76`: on deserialization, constant values are recursively unwrapped up to depth 10 to handle accidentally-nested bindings. This guard exists to fix corrupted scene data. If that serialization path is fixed (no longer producing nested constants), the guard is still fine to keep as a safety net, but deserves a comment explaining the origin rather than looking like intentional production logic.

---

### Q3: Is the documentation up to date?

**No — `docs/automation/overview.md` is significantly behind.** It reflects the pre-bezier, pre-`segmentInterpolation` state of the system. Specific gaps:

| Section | Issue |
|---|---|
| `AutomationKeyframe` type block | Shows only `tick`, `value`, `easingId` — missing the 5 new fields |
| `AutomationChannel` type block | Shows no `@deprecated` on `interpolation`; `valueType` missing `'string'` |
| Curve evaluation table | No mention of `automation-curve.ts` hybrid path, `interpolation-defaults.ts`, `automation-evaluator.ts` cache invalidation |
| Evaluation rules | Describes legacy easing-only path; bezier/segmentInterpolation not mentioned |
| Key file map | Missing `migration.ts`, `interpolation-defaults.ts`, `clipboard.ts` |
| Schema version | Says "Phases 1–7 complete as of schema v5" — current version is 6 |
| Developer notes | No guidance on bezier handles, auto-handle computation, or the Catmull-Rom auto path |

**Recommended doc update scope:**
1. Rewrite the data model section to show the current `AutomationKeyframe` fields, with a note that `easingId`/`interpolation` are legacy and migrated on load
2. Add a "Hybrid interpolation" section describing the `segmentInterpolation` dispatch logic
3. Add a "Bezier handles" section covering `BezierHandle`, `HandleType`, and the auto-compute fallback
4. Update the key file map
5. Update the schema version references

---

### Summary priority order

| # | Item | Effort | Risk |
|---|---|---|---|
| 1 | Update `docs/automation/overview.md` | Low | None |
| 2 | Make `getValueWithContext` required with a default | Low | None |
| 3 | Remove `require()` fallback in evaluator | Low | None |
| 4 | Add automation structural validation in `validate.ts` | Low | None |
| 5 | Refactor color bezier to extract `evaluateBezierT` helper | Low | Low |
| 6 | Deprecate/clean `easingId` from new keyframe output (schema v7) | Medium | Needs migration test |
| 7 | Change channel ID separator from `.` to `::` (schema v7) | Medium | Needs migration + store rekey |

Items 6 and 7 can be bundled into a single schema v7 migration pass. Items 1–5 are independent and can be done in any order.
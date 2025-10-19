# Improving Scene Element Property Retrieval

## Status

-   **Option A implemented.** `SceneElement.getProps` and reusable transforms ship in `base.ts`, and all current elements now rely on the helper instead of calling `getProperty` directly. Reference tests live in `baseSceneElement.test.ts`.

## Why this matters

-   Many scene elements call `this.getProperty('foo')` repeatedly inside `buildRenderObjects`.
-   These lookups expand into dozens of very similar lines (font options, colors, layout switches, etc.), hurting readability and adding error-prone boilerplate.
-   Every call re-runs default resolution and type coercion logic, so redundant calls cost time during hot render loops.

## Goals

1. Shrink the repeated "property grab" prologues in each element.
2. Make the code self-documenting by grouping related properties.
3. Cache or memoise property reads per render to avoid rework.
4. Keep migration lightweight so existing elements are easy to adopt incrementally.

## Option A — Typed property snapshots via helper

Introduce a `SceneElement` helper that batches property access and optional transforms:

```ts
// base.ts
protected getProps<T extends Record<string, PropertyDescriptor>>(descriptors: T): PropertySnapshot<T> {
    const resolved = {} as PropertySnapshot<T>;
    for (const [key, descriptor] of Object.entries(descriptors)) {
        const raw = this.getProperty(key);
        const value = descriptor.transform ? descriptor.transform(raw, this) : raw;
        resolved[key as keyof T] = value ?? descriptor.defaultValue;
    }
    return resolved;
}
```

Usage inside `buildRenderObjects`:

```ts
const props = this.getProps({
    visible: {},
    fontFamily: { transform: parseFontSelection },
    fontSize: { defaultValue: 30 },
    color: { defaultValue: '#fff' },
    midiTrackId: {},
    showAllAvailableTracks: { defaultValue: false },
});

if (!props.visible) return [];
const { family, weight } = props.fontFamily;
```

Benefits:

-   Removes repetitive `const foo = this.getProperty('foo')` lines.
-   Centralised default/transform logic with TypeScript inference (`PropertySnapshot<T>` builds the correct result type).
-   Allows per-property post-processing without cluttering elements.

Migration strategy:

1. Add helper and supporting types (`PropertyDescriptor`, `PropertySnapshot`) in `SceneElement` base.
2. Update one element (e.g. `notes-playing-display`) as an example.
3. Gradually migrate other elements when touching them; no breaking change because `getProperty` still exists.

## Option B — Config schema driven auto binding

Leverage the existing `EnhancedConfigSchema` to generate typed accessors automatically:

1. Extend schema definitions so each property can declare `runtimeKey?` and `transform?`.
2. Build a compile-time generator (or runtime helper) that reads the schema once and emits a `buildPropertyBag()` function for the element.
3. Inside `SceneElement`, cache the schema-derived descriptors so `buildRenderObjects` can do:

```ts
const props = this.buildPropertyBag(targetTime);
```

This approach keeps schema and runtime in sync, but requires more plumbing (parsing schema at load time, optional codegen). Choose this if we want zero duplication between schema defaults and runtime defaults.

## Option C — Memoised getter map

Add a lightweight memo layer on top of existing `getProperty` without new types:

```ts
protected snapshotProperties<T extends readonly string[]>(keys: T): Pick<ElementConfig, T[number]> {
    const result = {} as Pick<ElementConfig, T[number]>;
    for (const key of keys) result[key] = this.getProperty(key);
    return result;
}
```

This keeps the API minimal but still trims boilerplate. Combine with destructuring for clarity:

```ts
const { fontSize, color, textJustification } = this.snapshotProperties(['fontSize', 'color', 'textJustification']);
```

## Recommended path

Start with **Option A**:

-   It balances ergonomics, type safety, and incremental rollout.
-   Lets us embed transforms (e.g. `parseFontSelection`) and defaults without duplicating schema values where we dont want to.
-   Can be extended later to read descriptors from the schema (stepping toward Option B) or to memoise results across frames.

### Implementation checklist

1. Define `PropertyDescriptor` and `getProps` in `SceneElement`.
2. Provide utility transforms (`asNumber`, `asBoolean`, etc.) for common patterns.
3. Update one high-traffic element as reference, documenting before/after diff.
4. Add tests for the helper in `baseSceneElement.test.ts` (ensure defaults & transforms apply). This guards against regressions.
5. Roll out to other elements opportunistically, shrinking files and improving readability.

## Future enhancements

-   Add per-frame caching so repeated `buildRenderObjects` calls with identical config reuse the same snapshot.
-   Integrate with schema validation to auto-generate descriptors.
-   Expose ESLint rule or code-mod to migrate `getProperty` lines automatically, keeping codebase consistent.

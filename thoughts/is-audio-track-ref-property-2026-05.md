# `_isAudioTrackRefProperty` — Alternatives to Schema Traversal

## Current situation

`_isAudioTrackRefProperty(key)` in `base.ts` (line 213) checks whether a property key
refers to a `timelineTrackRef` by walking the full `tabs → groups → properties` hierarchy
of the element's config schema. It is called from two places:

- `onPropertyChanged` — once per property-change event
- The macro sync handler — once per changed macro key

`_findAudioTrackRefKey` (line 227) does the same three-level traversal to find the first
audio track ref key. Both methods are O(P) where P = total properties across all tabs.

For most elements P is small (10–30), so the cost is not alarming today. The issue is
structural: the schema is stable for the lifetime of a class, yet we re-traverse it on
every event.

---

## Options

### A — Lazy `Set` cached on the constructor (simple)

On first call, scan the schema once and store a `Set<string>` of track-ref keys directly
on the constructor. Subsequent calls are O(1).

```typescript
private _isAudioTrackRefProperty(key: string): boolean {
    const ctor = this.constructor as any;
    ctor._trackRefKeySet ??= buildTrackRefKeySet(ctor.getConfigSchema?.());
    return ctor._trackRefKeySet.has(key);
}

function buildTrackRefKeySet(schema: EnhancedConfigSchema | undefined): Set<string> {
    const keys = new Set<string>();
    for (const tab of schema?.tabs ?? [])
        for (const group of tab.groups ?? [])
            for (const p of (group.properties ?? []) as PropertyDefinition[])
                if (p?.type === 'timelineTrackRef') keys.add(p.key);
    if (keys.size === 0) keys.add('audioTrackId'); // legacy fallback
    return keys;
}
```

**Pros:** minimal change, no new infrastructure, covers `_isAudioTrackRefProperty`.  
**Cons:** mutates the constructor object (unconventional); `_findAudioTrackRefKey` still
needs its own equivalent cache, so the traversal logic is duplicated.

---

### B — Module-level `WeakMap` flat property index (recommended)

A single module-level `WeakMap<Function, Map<string, PropertyDefinition>>` stores a
flattened key→definition index per class, built lazily on first use. Both
`_isAudioTrackRefProperty` and `_findAudioTrackRefKey` share the same index.

```typescript
// module-level
const _schemaIndex = new WeakMap<Function, Map<string, PropertyDefinition>>();

function getSchemaIndex(ctor: any): Map<string, PropertyDefinition> {
    if (!_schemaIndex.has(ctor)) {
        const map = new Map<string, PropertyDefinition>();
        const schema = ctor.getConfigSchema?.() as EnhancedConfigSchema | undefined;
        for (const tab of schema?.tabs ?? [])
            for (const group of tab.groups ?? [])
                for (const p of (group.properties ?? []) as PropertyDefinition[]) if (p?.key) map.set(p.key, p);
        _schemaIndex.set(ctor, map);
    }
    return _schemaIndex.get(ctor)!;
}
```

The two methods then become:

```typescript
private _isAudioTrackRefProperty(key: string): boolean {
    const def = getSchemaIndex(this.constructor).get(key);
    return def ? def.type === 'timelineTrackRef' : key === 'audioTrackId';
}

private _findAudioTrackRefKey(): string {
    for (const [, def] of getSchemaIndex(this.constructor)) {
        if (def.type === 'timelineTrackRef') {
            const allowed = (def as any).allowedTrackTypes as string[] | undefined;
            if (!allowed || allowed.includes('audio')) return def.key;
        }
    }
    return 'audioTrackId';
}
```

**Pros:** no constructor mutation; WeakMap prevents memory leaks if classes are ever
GC'd; single traversal shared by both methods; easy to extend (any future method that
looks up a property by key uses the same cache).  
**Cons:** slightly more boilerplate than option A; `_findAudioTrackRefKey` iterates the
map rather than using a direct lookup (still O(1) average for typical element sizes, and
the map is built once anyway).

---

### C — Explicit static declaration on the element class

Add an optional static `trackRefPropertyKeys(): string[]` override that element classes
can implement directly rather than relying on schema reflection. The base implementation
falls back to option B's lazy scan.

```typescript
// In SceneElement base
private _isAudioTrackRefProperty(key: string): boolean {
    const ctor = this.constructor as any;
    if (typeof ctor.trackRefPropertyKeys === 'function') {
        return (ctor.trackRefPropertyKeys() as string[]).includes(key);
    }
    // fallback: schema scan
    return getSchemaIndex(ctor).get(key)?.type === 'timelineTrackRef'
        ?? key === 'audioTrackId';
}
```

**Pros:** explicit and self-documenting; elements with performance-sensitive event loops
can short-circuit the schema entirely.  
**Cons:** adds a convention authors must know about; the `includes` call on an array
re-introduces O(N) unless they provide a Set. Most elements would just use the fallback
anyway, making the static override optional boilerplate.

---

### D — Flat property list in the schema shape

Change `EnhancedConfigSchema` to also expose a flat `allProperties: PropertyDefinition[]`
field populated at schema-definition time (e.g. in the `tab.*` helpers in
`plugin-sdk-prop-groups`). Every tab helper appends to this list automatically.

**Pros:** eliminates all three-level traversals across the codebase (not just these two
methods); canonically derivable from the schema builders.  
**Cons:** larger surface-area change — all tab/group builders need updating; must not
break any existing serialized schema data; the two methods in `base.ts` are the only
current callsites, so the payoff is modest compared with option B.

---

## Recommendation

**Option B** is the right call. It is a contained, low-risk change: no public API
changes, no schema format changes, no convention for element authors to learn. The
WeakMap is idiomatic for per-class metadata and keeps both methods in sync with a single
source of truth. The implementation is ~15 lines added to `base.ts` and the two existing
private methods shrink to single-line lookups.

If the schema shape is ever revised to add a flat property list (option D) that becomes
the natural place to read from; option B's `getSchemaIndex` helper can simply be updated
to read that list instead of traversing tabs.

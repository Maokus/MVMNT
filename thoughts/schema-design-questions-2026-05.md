# Schema Design Questions — May 2026

## Is `insertElementGroups` still necessary?

`insertElementGroups` currently does three things:

1. Merges identity overrides (`name`, `description`, `category`) onto the base schema.
2. Prepends `base.tabs[0]` (the Transform tab) to the plugin-supplied tabs.
3. Returns the merged `EnhancedConfigSchema`.

The Transform tab injection is the load-bearing part. Without it, every element would have to remember to include `super.getConfigSchema().tabs[0]` themselves — easy to forget, fragile.

### Alternative approaches

**Option A — Explicit super call**

Require elements to spread the base tabs manually:

```ts
static override getConfigSchema(): EnhancedConfigSchema {
    const base = super.getConfigSchema();
    return {
        ...base,
        name: 'My Element',
        tabs: [base.tabs[0], tab.content([...]), tab.appearance([...])],
    };
}
```

Drawback: verbose and error-prone. Forgetting `base.tabs[0]` silently drops the Transform tab. The intent (`insertElementGroups`) is clearer than the mechanism.

**Option B — Decorator / class-level metadata**

Attach identity and tab configuration via a class decorator:

```ts
@element({
    name: 'My Element',
    description: '...',
    category: 'Audio Displays',
    tabs: [tab.content([...])],
})
export class MyElement extends SceneElement {}
```

The decorator merges with base tabs at class-definition time. Drawback: decorators are still stage-3 in TypeScript config terms, and this moves schema logic out of the method where developers expect to find it. Static analysis of tab contents becomes harder.

**Option C — Named tab slots**

Instead of positional `tabs[0]`, use named slots that the schema merger resolves:

```ts
static override getConfigSchema() {
    return {
        ...super.getConfigSchema(), // includes all base tabs by name
        name: 'My Element',
        tabs: {
            transform: 'inherit',      // keep base Transform tab as-is
            content: tab.content([...]),
            appearance: tab.appearance([...]),
        },
    };
}
```

This is a larger rethink but eliminates the `tabs[0]` coupling. Drawback: requires changing the `EnhancedConfigSchema` type and all existing elements. Not worth the churn right now.

### Verdict

`insertElementGroups` is still the right default. It's a small function with a clear name and prevents the silent-drop bug. The main thing worth improving is the name — `mergeElementSchema` or `defineElement` would be more discoverable. The decorator approach (Option B) is worth revisiting when decorators are stable and if the number of elements grows significantly.

---

## How can the preset system be improved?

### Current state

Presets are attached inline on `PropertyGroup` objects:

```ts
{
    id: 'noteRange',
    label: 'Note Range',
    properties: [...],
    presets: [
        { id: 'debugLarge', label: 'Debug Large', values: { noteSize: 80, minNote: 60, maxNote: 68 } }
    ],
}
```

Problems:

1. **Scope mismatch.** Preset `values` can reference keys outside the group (e.g., `noteSize` in `noteRange`'s preset). The group is the wrong owner.
2. **Discoverability.** There is no single place to enumerate all presets for an element. Tooling has to walk the full tab/group tree.
3. **No top-level metadata.** Element-level presets ("set everything to a good starting point") can't be expressed; there's nowhere to put them.
4. **No inheritance.** Plugin elements can't extend or override presets from a parent schema.

### Proposed improvement: top-level presets on `EnhancedConfigSchema`

Move presets to the schema root, parallel to `tabs`:

```ts
interface EnhancedConfigSchema {
    name: string;
    description?: string;
    category?: string;
    tabs: PropertyTab[];
    presets?: ElementPreset[]; // new
}

interface ElementPreset {
    id: string;
    label: string;
    description?: string;
    thumbnail?: string; // optional preview image path
    values: Record<string, unknown>;
}
```

Benefits:

- Presets have a canonical location, easy to enumerate.
- Values can span multiple groups and tabs without confusion.
- `insertElementGroups` (or its successor) can merge base presets with plugin presets.
- Group-level `presets` can be removed from `PropertyGroup`, eliminating the scope mismatch.

Migration path: deprecate `PropertyGroup.presets`, read both locations during a transition window, remove group-level presets in v2 of the schema.

### Separate concerns: UI grouping vs data grouping

The deeper issue is that presets are both **visual shortcuts** (show a set of good defaults in the UI) and **data snapshots** (reproducible property states). These could be separated:

- **Quick presets** (current): inline, ephemeral, UI-only — keep them close to the group for discoverability in code.
- **Saved presets** (future): user-created, persisted in the scene, potentially shared — belong in a separate store, not in the schema at all.

If/when saved presets are added, the schema presets should be clearly labelled as "factory" or "suggested" presets to avoid confusion with user-saved ones.

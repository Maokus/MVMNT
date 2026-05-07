# Property Panel — Tabbed System Research (May 2026)

## Background

The property panel currently renders a flat vertical list of collapsible `PropertyGroup` sections,
preceded by a toolbar containing search, preset, copy, paste, and reset controls. As elements have
grown in complexity (the piano roll has 11 groups; progress-display has ~6), the panel becomes long
and hard to navigate. The toolbar, meanwhile, takes up roughly two full rows for operations that
most users rarely invoke.

**The proposed change:**

1. Replace the toolbar area with a **tab strip**.
2. Reorganise the group hierarchy into `tabs → groups → props`.
3. Provide a built-in **Transform** tab for all base-element properties (position, scale, rotation,
   opacity, visibility) rather than injecting those groups into the element's own group list.
4. Remove the search, preset, copy, paste, and reset UI from the panel (see §5 for implications).

---

## 1. Current Architecture

### Schema

```
EnhancedConfigSchema
  └─ groups: PropertyGroup[]
       └─ properties: PropertyDefinition[]
```

`PropertyGroup` has a `variant?: 'basic' | 'advanced'` field. `insertElementGroups` uses this to
split groups: basic groups from the base schema go first, plugin groups go in the middle, advanced
groups (e.g. `advancedAnchor`) go last.

### Base element groups (from `base.ts`)

| id                | label                      | variant  | collapsed |
| ----------------- | -------------------------- | -------- | --------- |
| `basicVisibility` | Visibility & Layer         | basic    | false     |
| `basicTransform`  | Position, Rotation & Scale | basic    | false     |
| `advancedAnchor`  | Anchor & Skew              | advanced | true      |

### UI structure (`ElementPropertiesPanel.tsx`)

```
<div class="ae-properties-toolbar">       ← ~two rows tall
  <div class="ae-toolbar-row">
    <input type="search" />               ← search bar
  </div>
  <div class="ae-toolbar-row ae-element-actions">
    <select>Apply preset…</select>        ← conditional on whether presets exist
    <button>reset</button>
    <button>copy</button>
    <button>paste</button>
  </div>
</div>
{filteredGroups.map(<PropertyGroupPanel />)} ← scrollable list below
```

Collapse state is stored per-element in `sceneStore.interaction.expandedPropertyGroups[elementId][groupId]`.

---

## 2. Proposed Architecture

```
EnhancedConfigSchema
  └─ tabs: PropertyTab[]
       ├─ id: string
       ├─ label: string
       └─ groups: PropertyGroup[]   (same as today)
```

The base element provides one built-in tab, **Transform**, containing its three groups. Plugin
elements define their own additional tabs.

```
Transform tab (built-in, always present)
  ├─ Visibility & Layer
  ├─ Position, Rotation & Scale
  └─ Anchor & Skew (collapsed by default)

<Element-defined tabs>
  ├─ Tab A
  │    ├─ Group 1
  │    └─ Group 2
  └─ Tab B
       └─ Group 3
```

UI layout:

```
[Transform] [Source] [Notes] [Grid] [Style]   ← tab strip (replaces toolbar)
──────────────────────────────────────────────
  Group A label ▾
    prop …
    prop …
  Group B label ▾
    prop …
```

---

## 3. Schema API Design Options

### Option A — `tabs` replaces `groups` on `EnhancedConfigSchema`

```typescript
interface PropertyTab {
    id: string;
    label: string;
    groups: PropertyGroup[];
}

interface EnhancedConfigSchema {
    name: string;
    description: string;
    category?: string;
    tabs: PropertyTab[]; // replaces 'groups'
}
```

**Pros:** Clean hierarchy, explicit ownership, no ambiguity about which tab a group belongs to.  
**Cons:** Breaking change — anything that reads `schema.groups` must be updated. That includes
`ElementPropertiesPanel`, `PropertyGroupPanel`, the drift tests, `handleResetAll`,
`handleCopyElement`, search filter logic, preset aggregation, and property value initialisation
(all iterate `schema.groups` today). It's a significant but mechanical refactor.

### Option B — `tab?: string` added to `PropertyGroup`, tabs declared separately

```typescript
interface PropertyGroup {
    // ... existing fields ...
    tab?: string; // which tab this group belongs to; omit → default tab
}

interface EnhancedConfigSchema {
    // ... existing fields ...
    groups: PropertyGroup[]; // unchanged
    tabDefs?: { id: string; label: string }[]; // declare tab labels
}
```

**Pros:** Backwards-compatible; existing group lists still work. Groups without a `tab` appear in
a fallback tab (e.g. "Properties").  
**Cons:** Implicit grouping via string keys is error-prone; tab order depends on `tabDefs` order
and is not obvious from reading a group definition.

**Recommendation:** Option A. The migration is mechanical and the result is a clearer model. The
`groups` → `tabs` rename touches a bounded set of files, not the broader codebase.

---

## 4. `insertElementGroups` Migration

The current signature:

```typescript
insertElementGroups(
    base: EnhancedConfigSchema,   // has base groups (basic + advanced variants)
    overrides: { name?, description?, category? },
    pluginGroups: PropertyGroup[],
): EnhancedConfigSchema
```

It works by splitting `base.groups` into basic and advanced, inserting `pluginGroups` between them.

With tabs, the equivalent would be:

```typescript
insertElementGroups(
    base: EnhancedConfigSchema,       // base has one tab: Transform
    overrides: { name?, description?, category? },
    pluginTabs: PropertyTab[],        // one or more element-specific tabs
): EnhancedConfigSchema
```

Result: `[transformTab, ...pluginTabs]`. The base Transform tab is always first.

The `variant: 'basic' | 'advanced'` mechanism on `PropertyGroup` becomes largely obsolete since the
Transform/Advanced split is now expressed as group position within the Transform tab (or as a
separate "Advanced" tab if needed). The field can be kept for now and ignored during rendering, or
deprecated.

**Decision required: what does a plugin's `insertElementGroups` call look like?**

Minimal elements with few properties might not warrant multiple tabs. You need to decide whether:

- `pluginTabs` must always be an array of `PropertyTab` objects (forces authors to name their tabs), or
- There is a convenience overload: `insertElementGroups(base, overrides, groups: PropertyGroup[])` that
  auto-wraps them into a single anonymous tab labelled e.g. "Properties"

The auto-wrap approach makes migration easier but hides the tab structure from element authors
who don't read the docs carefully.

---

## 5. Removed Toolbar Items — Implications and Alternatives

The proposal is to remove search, preset, copy, paste, and reset from the visible UI.

### Search

Search is currently the most discoverable navigation shortcut — it lets users locate any property
by name without knowing which group it is in. Removing it entirely would hurt discoverability, but
it occupies a full row.

**Alternatives:**

- Trigger search with `Ctrl/Cmd+F` while the properties panel is focused; a search bar appears
  above the tabs and the tab strip is temporarily replaced with cross-tab flat results. Dismissed
  by Escape or clearing the input.
- Keep a compact search icon button (`⌕`) in the tab strip's trailing edge that expands on click.
- Remove completely and rely on tabs + group labels for navigation.

### Reset, Copy, Paste

These are infrequent but genuinely useful for power users. Removing them from the surface doesn't
mean they must be deleted from the codebase.

**Alternatives:**

- Right-click / long-press context menu on the element name in the scene tree or on the tab strip.
- Three-dot overflow menu (`…`) at the end of the tab strip.
- Keyboard shortcut only (undiscoverable for casual users).

**Note:** Copy/paste is currently stored in component-local state (`elementClipboard`), so it is
lost when you switch elements or re-mount the panel. This is already a limitation. Lifting it to a
Zustand slice or `useRef`-based singleton would make it more robust regardless of tab implementation.

### Presets

Presets are stored on `PropertyGroup` objects and surfaced via a `<select>` dropdown. They are only
present on a subset of elements today. With tabs, preset dropdowns could move to be a per-group
UI element inside the group header (matching their current data model), or be removed from the
default surface and accessed via context menu.

---

## 6. Active Tab State

Where is the selected tab stored?

| Option                    | Behaviour                             | Tradeoff                                                 |
| ------------------------- | ------------------------------------- | -------------------------------------------------------- |
| Local component state     | Resets to first tab on element switch | Simple; no persistence                                   |
| Per-element in sceneStore | Remembers last tab per element        | Needs new store slice; persists across selection changes |
| Global singleton          | One active tab name for all elements  | Odd UX if tab names differ across element types          |

The existing `expandedPropertyGroups[elementId][groupId]` pattern suggests the project is already
committed to per-element persistence for inspector state. A `activePropertyTab: Record<string, string>`
slice alongside it would be consistent.

**Decision required:** Should the active tab persist when you deselect and reselect an element, or
reset to the first tab (e.g. Transform)?

---

## 7. Tab Naming and Taxonomy

Currently `section.*` helpers define a canonical group id vocabulary:
`source → content → layout → appearance → typography → border → container → effects → advanced`

With tabs, a parallel `tab.*` vocabulary would make sense for the built-in tab names and define
their canonical display order. Suggested defaults:

| Tab id       | Label      | Contents                                                          |
| ------------ | ---------- | ----------------------------------------------------------------- |
| `transform`  | Transform  | Always built-in: visibility, position/scale/rotation, anchor/skew |
| `content`    | Content    | Text, notes, data source, main parameters                         |
| `appearance` | Appearance | Colors, fonts, borders, shadows                                   |
| `grid`       | Grid       | Grid/ruler overlays (piano roll, etc.)                            |
| `animation`  | Animation  | Playhead, motion settings                                         |
| `advanced`   | Advanced   | Rarely-changed tweaks                                             |

These are illustrative; the actual taxonomy depends on which elements exist and how their properties
cluster naturally. Elements with only a few properties may be fine with a single "Properties" tab.

**Decision required:** Is there a fixed canonical tab vocabulary (like `section.*` for groups),
or do elements define their own tab ids and labels freely?

---

## 8. Interaction with Existing Systems

### `visibleWhen` conditions

These operate on property values regardless of which tab the controlling property is in. No change
needed to the mechanism itself, but cross-tab conditional visibility (a property in tab B shown/
hidden by a value in tab A) is a potential confusion point. Not a blocker, but worth documenting.

### Macro assignments

Macro assignment is per-property and not tab-aware. No change needed.

### Keyframe controls / auto-keying

Similarly per-property, tab-agnostic. No change needed.

### `groupCollapseState` in sceneStore

Stored as `expandedPropertyGroups[elementId][groupId]`. Groups don't change — only which tab they're
in. This state persists correctly across the migration without any schema change.

### `propertyTypeMap` (fast type lookup for auto-keying)

Currently built by iterating `schema.groups`. With Option A this becomes `schema.tabs.flatMap(t => t.groups)`.
One-line change.

### Drift prevention tests (`api-drift.test.ts`)

These test capability exports, not property schemas. Unaffected.

---

## 9. Migration Path

1. **Schema type change** — add `PropertyTab` interface; change `EnhancedConfigSchema.groups` →
   `tabs: PropertyTab[]`. Keep a `groups` computed getter (`tabs.flatMap(t => t.groups)`) on the
   schema object, or update all consumers directly.
2. **`insertElementGroups`** — rewrite to accept `PropertyTab[]` for the plugin argument; wrap base
   groups in a Transform tab automatically.
3. **`ElementPropertiesPanel`** — replace the toolbar JSX with a tab strip; `filteredGroups` becomes
   `filteredGroupsForActiveTab`; a search mode (if retained) temporarily shows cross-tab results.
4. **Base element schema** — `base.ts` `getConfigSchema()` returns a schema with one tab
   (`transform`) containing the three existing groups.
5. **All elements** — update `getConfigSchema()` calls to pass `PropertyTab[]` to
   `insertElementGroups`. This is the most tedious step (15–20 files).
6. **Store** — add `activePropertyTab: Record<string, string>` if per-element tab persistence is
   wanted.

---

## 10. Open Design Decisions Summary

| #   | Question                                   | Options                                                                          |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Schema model                               | Option A (tabs replace groups) vs Option B (tab field on groups)                 |
| 2   | `insertElementGroups` convenience overload | Require `PropertyTab[]` always vs allow `PropertyGroup[]` auto-wrapped           |
| 3   | Search                                     | Remove entirely, keyboard shortcut, or compact icon in tab strip                 |
| 4   | Copy / Paste / Reset                       | Remove entirely, overflow menu, right-click context menu, or keyboard shortcuts  |
| 5   | Active tab persistence                     | Component-local (reset on element switch) vs per-element in sceneStore           |
| 6   | Tab taxonomy                               | Fixed canonical vocabulary (`tab.*` helpers) vs free-form element-defined labels |
| 7   | Elements with few properties               | Require ≥1 non-transform tab vs allow single "Properties" tab auto-fallback      |
| 8   | Preset UI                                  | Remove from surface, move to group header, or context menu                       |
| 9   | `variant: 'basic'                          | 'advanced'` on PropertyGroup                                                     | Deprecate silently vs keep and use within Transform tab |
| 10  | Cross-tab `visibleWhen`                    | Document as supported but confusing, or add lint/warning                         |

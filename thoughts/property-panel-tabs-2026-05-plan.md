# Property Panel Tabs — Implementation Plan (May 2026)

Based on: `property-panel-tabs-2026-05.md` + `property-panel-tabs-2026-05-decisions.md`

---

## Completion Status — 7 May 2026

All planned phases are implemented.

- **Phase 1:** Complete. `PropertyTab` is first-class, `EnhancedConfigSchema` uses `tabs`, base schemas initialize from tab groups, and property tab interaction state exists in `sceneStore`.
- **Phase 2:** Complete. First-party elements, examples, and templates now pass `PropertyTab[]` via `tab.*` helpers. The old `groups` compatibility getter and `PropertyGroup.variant` field are removed.
- **Phase 3:** Complete. `ElementPropertiesPanel` renders a tab strip, filters groups by active tab, and persists the active tab per element.
- **Phase 4:** Complete. Search is available from the tab strip and Cmd/Ctrl+F, search spans all tabs, Escape or clearing the input exits search, Reset/Copy/Paste/presets are exposed through the overflow menu, and property clipboard state is stored in `sceneStore`.
- **Plugin authoring docs:** Updated. `docs/creating-custom-elements.md`, `docs/plugin-api-v1.md`, `docs/plugin-quickstart.md`, `docs/visual-asset-registry.md`, and template README snippets now describe the `tab.*`/`tabs` authoring pattern instead of `groups`/`variant`.

Verification:

- `npm run test` passed.
- `npm run build` passed.
- `npm run compile` passed.

---

## Phase 1 — Schema & Core Infrastructure

**Goal:** Introduce `PropertyTab` as a first-class type, update all internal consumers, add the store slice and tab helpers. No element files touched yet. Zero visible UI change — the panel continues to render identically via a compatibility shim.

### Changes

#### `src/core/types.ts`

- Add `PropertyTab` interface above `EnhancedConfigSchema`:
    ```typescript
    export interface PropertyTab {
        id: string;
        label: string;
        groups: PropertyGroup[];
    }
    ```
- Change `EnhancedConfigSchema.groups` to `tabs: PropertyTab[]`.
- Add a deprecated compat getter `get groups()` that returns `this.tabs.flatMap(t => t.groups)` — this keeps all internal consumers unchanged during Phase 1. Mark with `@deprecated` JSDoc.
- Mark `PropertyGroup.variant` with `@deprecated` JSDoc (do not remove yet).

#### `src/core/scene/plugins/plugin-sdk-prop-factories.ts` — `insertElementGroups`

- Update return type path: base `Transform` tab is built from `base.tabs[0]` groups (after `base.ts` is updated).
- Add overload union: third argument accepts `PropertyTab[] | PropertyGroup[]`.
- Add type guard `function isPropertyTabArray(x): x is PropertyTab[]` — checks `x[0]?.groups !== undefined`.
- When given `PropertyTab[]`: result = `[transformTab, ...pluginTabs]`.
- When given `PropertyGroup[]` (compat path): wrap them into a single `{ id: 'properties', label: 'Properties', groups: pluginGroups }` tab, then prepend Transform tab. Log no warning (silent compat).
- Export `isPropertyTabArray` from the SDK surface for any consumers that need it.

#### `src/core/scene/plugins/plugin-sdk-prop-groups.ts` — add `tab.*` helpers

Add a `tab` namespace alongside `section` and `propGroup`:

```typescript
export const tab = {
    transform(groups: PropertyGroup[]): PropertyTab,   // id: 'transform', label: 'Transform'
    content(groups: PropertyGroup[]): PropertyTab,     // id: 'content', label: 'Content'
    appearance(groups: PropertyGroup[]): PropertyTab,  // id: 'appearance', label: 'Appearance'
    grid(groups: PropertyGroup[]): PropertyTab,        // id: 'grid', label: 'Grid'
    animation(groups: PropertyGroup[]): PropertyTab,   // id: 'animation', label: 'Animation'
    advanced(groups: PropertyGroup[]): PropertyTab,    // id: 'advanced', label: 'Advanced'
    properties(groups: PropertyGroup[]): PropertyTab,  // id: 'properties', label: 'Properties' — escape hatch for simple elements
    custom(id: string, label: string, groups: PropertyGroup[]): PropertyTab,
} as const;
```

Export `tab` from `plugin-sdk.ts` (public SDK surface).

#### `src/core/scene/elements/base.ts`

- Change `getConfigSchema()` to return `EnhancedConfigSchema` with `tabs` instead of `groups`.
- The single tab is `{ id: 'transform', label: 'Transform', groups: [basicVisibility, basicTransform, advancedAnchor] }`.
- Remove the `variant` field from the three groups (it becomes meaningless; all three are just in the Transform tab in order).
- Update property initialization loop at lines 325–326: change `schema.groups` → `schema.tabs.flatMap(t => t.groups)`.

#### `src/state/sceneStore.ts`

- Add `activePropertyTab: Record<string, string>` to `SceneInteractionState` (alongside `expandedPropertyGroups`).
- Initialize to `{}` in `createInitialInteractionState()`.
- Add action `setActivePropertyTab(elementId: string, tabId: string): void` using the same immutable-update pattern as `setPropertyGroupCollapseState`.

#### Internal consumers of `schema.groups` (update all to use the compat getter, or explicit flatMap)

These all currently use `schema.groups` directly; they compile fine via the compat getter but update them explicitly to `schema.tabs.flatMap(t => t.groups)` so the getter can be removed in Phase 2:

- `src/context/SceneSelectionContext.tsx:368` — `schema.groups ?? []` → `schema.tabs.flatMap(t => t.groups)`
- `src/workspace/panels/timeline/automation/AutomationCurvePane.tsx:107` — same
- `src/workspace/panels/properties/InsertKeyframePopup.tsx:117` — same
- `src/workspace/panels/properties/ElementPropertiesPanel.tsx:80` — `propertyTypeMap` useMemo
- `src/workspace/panels/properties/ElementPropertiesPanel.tsx` — `filteredGroups` useMemo, `handleResetAll`, copy/paste group iteration: all change from `enhancedSchema.groups` to `enhancedSchema.tabs.flatMap(t => t.groups)`

**Note:** `ElementPropertiesPanel` will NOT yet render tabs or filter by active tab — that is Phase 3. In Phase 1 it continues to render all groups as a flat list, just using the explicit flatMap.

### Acceptance Criteria

1. `npm run compile` (TSC) — zero errors.
2. The panel renders identically to before for all elements.
3. `schema.tabs` exists and contains at least one tab for every element (confirmed via DevTools spot-check on base element).
4. `sceneStore.interaction.activePropertyTab` exists and the setter fires without errors.
5. No TypeScript `any` suppressions introduced.

---

## Phase 2 — Element Migration

**Goal:** Update every element's `getConfigSchema()` to pass `PropertyTab[]` to `insertElementGroups`, replacing the compat `PropertyGroup[]` path. Remove the compat shim and the deprecated `groups` getter.

### Strategy

Each element falls into one of two buckets:

**Simple elements** (≤3 groups, no natural clustering): wrap in a single `tab.properties([...groups])`. Applies to most `misc/` elements, templates, and short audio-display elements.

**Complex elements** (4+ groups or clear domain clusters): assign groups to named tabs using `tab.*` helpers. The piano roll, for example, would have `tab.content` (notes/track), `tab.appearance` (colors), `tab.grid` (grid/ruler), `tab.advanced` (timing tweaks).

### Files to change (40 elements)

Use the following reference when assigning tabs:

| Element                        | Suggested tabs                                                               |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `audio-spectrum.ts`            | `content` (audio source, analysis), `appearance` (bar colors, style)         |
| `audio-waveform.ts`            | `content` (source, analysis), `appearance` (colors, line width)              |
| `audio-volume-meter.ts`        | `content` (source), `appearance`                                             |
| `audio-locked-oscilloscope.ts` | `content`, `appearance`                                                      |
| `moving-notes-piano-roll.ts`   | `content` (track, range), `appearance` (colors), `grid` (grid lines, labels) |
| `time-unit-piano-roll.ts`      | `content`, `appearance`, `grid`                                              |
| `progress-display.ts`          | `content`, `appearance`                                                      |
| `text-overlay.ts`              | `content` (text), `appearance` (font, colors), `advanced`                    |
| `time-display.ts`              | `content`, `appearance`                                                      |
| All remaining elements         | `properties` (single tab) if ≤3 groups; else cluster by domain               |

**Note:** Tab assignment for complex elements may need review. The plan author should review groupings on a case-by-case basis rather than blindly applying labels.

### Also in this phase

- Remove the `PropertyGroup[]` compat branch from `insertElementGroups` (keep only `PropertyTab[]` path).
- Remove the `isPropertyTabArray` type guard (no longer needed).
- Remove the deprecated `groups` getter from `EnhancedConfigSchema`.
- Remove `variant` field from `PropertyGroup` interface (it was deprecated in Phase 1 and is now unused everywhere).

### Acceptance Criteria

1. `npm run compile` — zero errors.
2. No remaining references to `insertElementGroups` with a `PropertyGroup[]` third argument (grep check: `insertElementGroups` calls with `[section.` or `propGroup.` or `[{` directly as third arg — all should be gone).
3. All elements render without console errors in the app.
4. Every element's `schema.tabs` has at least one non-Transform tab (DevTools spot-check).
5. The deprecated `groups` getter is gone — TypeScript will enforce this via the missing field.

---

## Phase 3 — Panel UI (Tab Strip)

**Goal:** Replace the toolbar with a tab strip. The panel renders only the groups belonging to the active tab. Active tab is persisted per element in sceneStore.

### Files to change

#### `src/workspace/panels/properties/ElementPropertiesPanel.tsx`

- Remove the `<div className="ae-properties-toolbar">` block entirely (both toolbar rows: search input and element-actions row).
- Add active tab state: read `sceneStore.interaction.activePropertyTab[elementId] ?? schema.tabs[0].id`.
- When `elementId` changes, if the stored tab id doesn't exist in the new element's `schema.tabs`, fall back to `schema.tabs[0].id`.
- Change `filteredGroups`: filter `enhancedSchema.tabs` to the active tab, then use that tab's groups (applying the existing `propertyPassesVisibility` and search-term filter logic — search term wire-up deferred to Phase 4, for now just leave `searchTerm = ''`).
- Add tab strip above the group list (inline JSX or extracted to `PropertyTabStrip.tsx`).
- Tab strip renders one button per `schema.tab`, highlights the active tab, calls `setActivePropertyTab` on click.
- The Transform tab is always first (it comes first in `schema.tabs` because `insertElementGroups` prepends it).

#### New component (optional): `src/workspace/panels/properties/PropertyTabStrip.tsx`

If the tab strip JSX is non-trivial, extract it. Props: `tabs: PropertyTab[]`, `activeTabId: string`, `onTabChange: (id: string) => void`.

#### CSS (wherever panel styles live — check for existing SCSS/CSS module)

- Tab strip: horizontal row of tab buttons, full panel width.
- Active tab: highlighted (underline or background variant matching the app's ae-style design language).
- Tabs overflow: if tabs don't fit, show scroll arrows or clip (simple solution first — the Transform + ≤4 tabs fits the panel width at normal size).

### What is NOT done yet

- Search (Phase 4).
- Reset/copy/paste/presets (Phase 4).
- Overflow menu (Phase 4).

### Acceptance Criteria

1. `npm run compile` — zero errors.
2. Tab strip renders above the property groups for every element.
3. Clicking a tab updates the visible groups immediately.
4. Switching elements: if the new element has a tab with the same id as the previously active tab, that tab is active; otherwise the first tab (Transform) is active.
5. The Transform tab always appears first.
6. Deselecting and reselecting an element restores the previously active tab.
7. Simple elements with a single "Properties" tab: the tab strip still renders (one tab shown), and all groups appear.
8. No console errors in normal usage.

---

## Phase 4 — Search & Actions UX

**Goal:** Restore search, reset, copy/paste as discoverable affordances without the old two-row toolbar.

### Search (Cmd/Ctrl+F)

- `ElementPropertiesPanel.tsx`: add `keydown` listener on the panel container for `Cmd+F` / `Ctrl+F` → set `searchActive = true`, focus the search input.
- When `searchActive` is true, render a search bar above the tab strip (pushing tabs down, or replacing them visually).
- `filteredGroups` in search mode: search across ALL tabs (`enhancedSchema.tabs.flatMap(t => t.groups)`), ignore active tab filter.
- Dismiss: `Escape` or clearing the input (input going empty → `searchActive = false`).
- Alternatively: compact `⌕` icon button at the trailing edge of the tab strip that toggles search mode on click (always visible, lower discoverability cost than keyboard-only).
- Decide at implementation time: keyboard-only vs icon button. Icon button is recommended for discoverability.

### Tab-strip overflow menu (`…`)

- Add a `…` button at the trailing edge of the tab strip (after the last tab, before the search icon if present).
- Menu items: **Reset all**, **Copy**, **Paste** (enabled when clipboard is non-empty).
- If the active element has any group with presets: add **Apply preset…** submenu or a flat list.
- Menu component: use whatever dropdown/menu primitive is already used in the codebase (check for existing `DropdownMenu` or `ContextMenu` component).

### Lift clipboard to sceneStore

- Currently `elementClipboard` is component-local state in `ElementPropertiesPanel`. Move to `sceneStore.interaction.clipboard` (a separate key from scene clipboard, or reuse the same `SceneClipboard` type if the structure matches).
- This makes paste available even after re-mounting the panel or switching elements and back.
- If `SceneClipboard` type doesn't match the property copy payload structure, add a new `propertyClipboard` key to `SceneInteractionState`.

### Acceptance Criteria

1. `npm run compile` — zero errors.
2. `Cmd+F` (Mac) / `Ctrl+F` (Win/Linux) while the panel is focused opens the search bar.
3. Search results show properties from all tabs matching the query.
4. `Escape` or clearing the search input closes search and returns to the normal tab view.
5. `…` overflow menu renders with Reset, Copy, Paste items.
6. Paste is disabled when clipboard is empty; enabled after Copy.
7. After copying, switching to another element and back, Paste is still available (clipboard persisted in store).
8. Presets (if any group has them) are accessible from the overflow menu.
9. No regression in existing tab navigation from Phase 3.

---

## Cross-cutting Notes

- **`visibleWhen` across tabs:** Supported without any code change — the condition evaluator reads property values, not tab context. Document this in a comment in `ElementPropertiesPanel`.
- **Macro assignments:** Per-property, tab-agnostic. No change needed.
- **Keyframe / auto-keying:** `propertyTypeMap` is updated in Phase 1 to flatMap all tabs. No further change needed.
- **`groupCollapseState`:** Keyed by `groupId`, which doesn't change across the migration. Persists correctly.
- **Templates in `_templates/`:** Should also be migrated in Phase 2 — they serve as reference implementations for plugin authors.

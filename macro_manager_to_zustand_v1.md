# Plan: Replace MacroManager singleton with a Zustand store slice

Date: 2025-09-17
Target branch: `0.12.1` → feature branch (e.g., `feat/macro-slice`)
Status: Draft v1

## Goals

-   Remove the `MacroManager` singleton and expose the same functionality via a colocated Zustand store slice.
-   Improve serialization/deserialization by relying on the app state tree rather than out-of-band singletons and event listeners.
-   Keep existing property binding API mostly intact while swapping its dependency to the store (short-term adapter).
-   Make macros testable, time-travel/debuggable (devtools), and persistable (optional) alongside the rest of app state.

## Current state (as of 0.12.1)

-   Singleton: `src/bindings/macro-manager.ts` with in-memory `Map<string, Macro>` and a custom listener bus for events: `macroCreated`, `macroDeleted`, `macroValueChanged`, `macrosImported`.
-   Consumers:
    -   `MacroBinding` in `src/bindings/property-bindings.ts` calls `globalMacroManager.getMacro()` and `updateMacroValue()`.
    -   UI context `src/context/MacroContext.tsx` mirrors/refreshes on manager events.
    -   Serialization is done via `exportMacros()`/`importMacros()` on the singleton (out of the main app state).

## Design: Macro slice for Zustand

We’ll introduce a dedicated macro slice so the app can have multiple instances in the future (tests, previews) and to remove global state coupling.

### Slice shape

```ts
export type MacroType =
    | 'number'
    | 'string'
    | 'boolean'
    | 'color'
    | 'select'
    | 'file'
    | 'file-midi'
    | 'file-image'
    | 'font'
    | 'midiTrackRef';

export interface MacroOptions {
    min?: number;
    max?: number;
    step?: number;
    selectOptions?: { value: any; label: string }[];
    accept?: string;
    [key: string]: any;
}

export interface Macro {
    name: string; // unique key (macroId)
    type: MacroType;
    value: any;
    defaultValue: any;
    options: MacroOptions;
    createdAt: number;
    lastModified: number;
}

export type MacroEventType = 'macroCreated' | 'macroDeleted' | 'macroValueChanged' | 'macrosImported'; // kept for parity if needed by UI

export type MacroSlice = {
    macrosById: Record<string, Macro>;
    // actions
    createMacro: (name: string, type: MacroType, defaultValue: any, options?: MacroOptions) => boolean;
    deleteMacro: (name: string) => boolean;
    updateMacroValue: (name: string, value: any) => boolean;
    getMacro: (name: string) => Macro | undefined; // convenience for non-hook code
    getAllMacros: () => Macro[];
    importMacros: (data: { macros: Record<string, Macro>; exportedAt?: number }) => boolean;
    exportMacros: () => { macros: Record<string, Macro>; exportedAt: number };
    clearMacros: () => void;
};
```

-   Internally, we’ll store macros in `macrosById` (plain object) for easy JSON serialization.
-   The existing value validation rules from the singleton should be ported as pure helpers.

### Where to place the slice

-   Create `src/state/slices/macroSlice.ts` (new) and export a `createMacroSlice: StateCreator<MacroSlice>`.
-   Integrate into the primary store file or a root store composition point:
    -   If we continue using `src/state/timelineStore.ts` as the monolithic store for now, extend its state to include `MacroSlice`.
    -   Alternatively, introduce a small `src/state/rootStore.ts` that composes `timeline` and `macro` slices using the same `create()` call. Keep API stable by re-exporting the unified `useRootStore` or continue `useTimelineStore` but add macro methods/state; choose the least disruptive option. For v1, extending the existing `useTimelineStore` is acceptable to minimize changes.

### Actions and semantics

-   `createMacro(name, type, defaultValue, options)`
    -   If the name already exists, return false.
    -   Create `Macro` and set `value = defaultValue`.
    -   Update `macrosById[name]`.
-   `deleteMacro(name)`
    -   Remove from `macrosById`.
    -   No assignment cleanup needed (bindings degrade to constants on save/serialize elsewhere) but we will consider notifying a lightweight event for UI parity (optional).
-   `updateMacroValue(name, value)`
    -   Validate via `_validateValue(type, value, options)`.
    -   Write to `macrosById[name].value` and bump `lastModified`.
-   `getMacro(name)` and `getAllMacros()`
    -   Convenience non-reactive helpers that read from current store state (via `get()`).
-   `importMacros(data)` / `exportMacros()` / `clearMacros()`
    -   Mirror current singleton behavior exactly for serialization parity.

### Events vs Reactivity

-   Replace the custom listener bus with native store reactivity:
    -   UI components subscribe to `useTimelineStore((s) => s.macrosById)` or derived selectors.
    -   For code paths that required imperative events (e.g., `PropertyBinding` runtime), we’ll adapt those consumers to use the store directly.
    -   If some parts still benefit from DOM CustomEvents, we can optionally dispatch them inside actions as a temporary shim during migration. Keep them behind a flag or emit only key ones (`macroValueChanged`) to avoid surprises.

### Updating consumers

1. `PropertyBinding` macro dependency

    - Replace `import { globalMacroManager }` with store accessors.
    - Option A (simple): import `useTimelineStore.getState()` in the binding module and query `getMacro()`/`updateMacroValue()` methods.
        - `getValue()`: `const m = useTimelineStore.getState().getMacro(this.macroId); return m?.value;`
        - `setValue(v)`: `useTimelineStore.getState().updateMacroValue(this.macroId, v);`
    - This keeps `PropertyBinding` class non-React and avoids singletons.

2. `MacroContext`

    - Remove its dependency on `globalMacroManager` and turn it into a thin adapter over the store slice:
        - `macros = useTimelineStore((s) => Object.values(s.macrosById))`
        - `create`, `updateValue`, `delete`, `get` call the slice actions.
        - For imperative listeners, offer `subscribe( selector, listener, { equalityFn } )` using Zustand’s subscribe utilities if needed.

3. Any other direct imports of `globalMacroManager` (search/replace) should switch to the slice API.

### Persistence/serialization

-   Keep macros in memory by default, but expose `exportMacros()`/`importMacros()` from the slice for scene save/load.
-   Optional: add `persist` middleware to the whole store or only the macro slice key if you want automatic session restore. If enabled, ensure `File` types are not persisted (they aren’t serializable)—the validator already disallows storing `File` instances long-term; consider storing file references/ids instead.

### Validation helper

Extract the singleton’s `_validateValue` as a pure function shared by the slice:

```ts
export function validateMacroValue(type: MacroType, value: any, options: MacroOptions = {}): boolean {
    /* copy logic */
}
```

### API compatibility surface

-   Names and behavior of `createMacro`, `deleteMacro`, `updateMacroValue`, `getMacro`, `getAllMacros`, `exportMacros`, `importMacros`, `clearMacros` remain the same in spirit, now on the store.
-   `ElementMacro` and assignment types remain removed; bindings live on elements.

## Step-by-step migration plan

1. Create slice file `src/state/slices/macroSlice.ts` with types and actions. Port validation logic.
2. Integrate slice into the existing store (`timelineStore.ts`) for v1 to minimize churn:
    - Extend `TimelineState` with `MacroSlice` fields/actions.
    - Update the store factory to spread `createMacroSlice(set, get)` into the state.
3. Adapt `PropertyBinding`:
    - Swap to use `useTimelineStore.getState()` rather than `globalMacroManager`.
4. Adapt `MacroContext`:
    - Derive `macros` from store, call slice actions, drop custom event wiring.
5. Add selectors (optional quality-of-life):
    - `selectMacroById(id)`, `selectMacrosArray`, `selectMacroValue(id)`.
6. Export/import paths:
    - Where scenes are saved/loaded, call the slice’s `exportMacros()`/`importMacros()` as part of your existing persistence routines.
7. Feature flag (optional):
    - Keep `globalMacroManager` as a deprecated shim that delegates to the store. Mark TODO to remove once references are gone.
8. Tests:
    - Unit test slice: create/update/delete/validate/import/export.
    - Update any existing tests that touched the singleton.
9. Cleanup:
    - Remove `src/bindings/macro-manager.ts` after all imports are migrated and tests pass.

## Example slice sketch

Non-final code outline to show how it fits:

```ts
// src/state/slices/macroSlice.ts
import type { StateCreator } from 'zustand';

export const createMacroSlice: StateCreator<any, [], [], MacroSlice> = (set, get) => ({
    macrosById: {},
    createMacro: (name, type, defaultValue, options = {}) => {
        const s = get();
        if (s.macrosById[name]) return false;
        const now = Date.now();
        const macro: Macro = {
            name,
            type,
            value: defaultValue,
            defaultValue,
            options,
            createdAt: now,
            lastModified: now,
        };
        set((st: any) => ({ macrosById: { ...st.macrosById, [name]: macro } }));
        return true;
    },
    deleteMacro: (name) => {
        const s = get();
        if (!s.macrosById[name]) return false;
        const { [name]: _, ...rest } = s.macrosById;
        set({ macrosById: rest });
        return true;
    },
    updateMacroValue: (name, value) => {
        const s = get();
        const m = s.macrosById[name];
        if (!m) return false;
        if (!validateMacroValue(m.type, value, m.options)) return false;
        set((st: any) => ({ macrosById: { ...st.macrosById, [name]: { ...m, value, lastModified: Date.now() } } }));
        return true;
    },
    getMacro: (name) => get().macrosById[name],
    getAllMacros: () => Object.values(get().macrosById),
    exportMacros: () => ({ macros: { ...get().macrosById }, exportedAt: Date.now() }),
    importMacros: (data) => {
        set({ macrosById: { ...data.macros } });
        return true;
    },
    clearMacros: () => set({ macrosById: {} }),
});
```

## Pros and cons of moving to a Zustand slice

### Pros

-   Single source of truth: macros live in the app store, enabling consistent serialization, undo/redo, and scene export.
-   Testability: no global state; you can create isolated stores for tests and fixtures.
-   Reactivity: UI updates automatically via selectors; no custom event bus needed.
-   Devtools/time-travel: macro changes visible in Redux/Devtools inspectors when middleware is used.
-   Composition: multiple scenes/tabs could each have their own store instance without cross-talk.

### Cons / Risks

-   Refactor surface: consumers must switch from the singleton to the slice; temporary shim may be needed.
-   Non-React consumers: classes like `PropertyBinding` must access the store via `getState()`, which is an implicit global reference to the current store instance. If you ever support multiple concurrent stores in one runtime, you’ll need injection of the store reference.
-   Serialization edge cases: `file` macro type currently allows `File` objects; these are not serializable. Ensure the slice never persists actual `File` instances (store ids/handles instead) or exclude from export.
-   Performance: frequent `updateMacroValue` calls will trigger re-renders for subscribers to `macrosById`; mitigate with fine-grained selectors and `shallow` compare.

## Incremental rollout strategy

-   Phase 1 (compat): Add slice, keep singleton delegating to it. Update `PropertyBinding` and `MacroContext` to the slice. Monitor for regressions.
-   Phase 2 (cleanup): Remove event shims and the deprecated singleton. Convert remaining imports. Update docs.
-   Phase 3 (hardening): Add unit tests, ensure persistence/export includes macros, optimize selectors.

## Acceptance criteria

-   All existing macro features (create/update/delete/import/export, macro-bound properties updating) work with the slice.
-   No direct references to `globalMacroManager` in app code (except temporary shim during Phase 1 if used).
-   Macros serialize with scene save/export and load back correctly.
-   Unit tests cover happy-path and basic validation errors.

## Notes

-   Keep `PropertyBinding` signature unchanged; only its internal dependency changes. If we later want per-store injection, consider passing a store reference to `MacroBinding` constructor or reading from a context.
-   Use `zustand/shallow` for UI selectors where appropriate.

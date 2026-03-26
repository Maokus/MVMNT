## Potential Issues & Confusions

### 1. Drift prevention assertion is a no-op

`plugin-sdk.ts:136` — The `_CheckExportedCapabilities` mechanism is described as enforcing that all capabilities are exported, but it doesn't actually do that:

```typescript
const _verifyCapabilityExports: _CheckExportedCapabilities = {} as any;
```

The `as any` means TypeScript accepts it unconditionally. Even without `as any`, the assertion only checks a local variable's shape — not what's actually exported from the module. The 4 capability names are **hard-coded** in the type at lines 127–130. If a 5th capability is added to `PLUGIN_CAPABILITIES`, this file won't error on its own unless someone also manually adds it to `_CheckExportedCapabilities`. The `api-drift.test.ts` tests are the real enforcement mechanism here, not this type assertion.

---

### 2. `TimelineNoteEvent` leaks an internal module path through the SDK

`plugin-sdk.ts:69`:
```typescript
export type { TimelineNoteEvent } from '@state/selectors/timelineSelectors';
```

Plugin authors import this type from `@mvmnt/plugin-sdk` but it physically lives inside `@state/selectors/` — the Zustand state layer. If the type is ever refactored to live somewhere else, or if its definition changes, the SDK contract could silently break without anything in the plugin infrastructure flagging it. Ideally this type would be defined in a stable neutral location (like near `plugin-api.ts`) rather than re-exported from a state selector file.

---

### 3. `alias` is at the wrong level in `vite.config.ts`

`vite.config.ts:31`:
```typescript
alias: {
    '@': path.resolve(__dirname, 'src'),
},
```

This is a **top-level key** in the config object. Vite path aliases belong under `resolve.alias`. At the top level, this key is silently ignored by Vite. The `@/something` shortcut the comment describes probably doesn't work, which could silently waste a future developer's time if they try to use it.

---

### 4. `dist/` has stale built plugin artifacts on disk

`/dist/` contains built `.mvmnt-plugin` files for plugins that have been removed from the repo:
```
myplugin-1.0.0.mvmnt-plugin
myplugin-1.0.1.mvmnt-plugin
myplugin2-1.0.0.mvmnt-plugin   ← repo has no myplugin2/ anymore
myplugin2-1.0.1.mvmnt-plugin
myplugin3-1.0.0.mvmnt-plugin
```

They're gitignored so they're harmless to version control, but they'll confuse anyone grepping or diffing plugin versions on their local machine. Worth a `rm dist/*.mvmnt-plugin` to clean house.

---

### 5. `myplugin3/` is gitignored — invisible to others

`.gitignore` blocks `src/plugins/*` (except `extraspack1/`), so `myplugin3/` only exists on your local machine. This isn't a problem per se, but it's a sample plugin with 6 files that future contributors won't see. If it's meant to be the canonical new-plugin template, it probably should be tracked (or moved to `scripts/` or `docs/`).

---

### 6. Three different "plugin" directories without a clear map

```
src/plugins/           ← source code (extraspack1 tracked, myplugin3 local-only)
public/default-plugins/ ← served-at-runtime .mvmnt-plugin bundles (only extraspack1)
dist/                  ← stale build output (gitignored)
```

There's no README or comment explaining the relationship between these three. Someone new to the project won't know that `public/default-plugins/` is where runtime-installed plugins live or how a `src/plugins/foo/` ends up as a `.mvmnt-plugin` file.

---

### 7. `template.ts` exclusion is doubly guarded but confusingly split

The template animation has both:
- `registerAnimation(...)` commented out at the bottom of `template.ts`
- An explicit exclusion in the `import.meta.glob` pattern in `index.ts`

If someone copies `template.ts` to make a new animation, they'll notice one or both of these, but the meaning isn't obvious: "I need to uncomment the registration AND make sure my file isn't in the exclusion list." A comment in `template.ts` explaining this would save a future head-scratch.

---

### 8. `beta` build mode is invisible

`vite.config.ts:10`:
```typescript
mode === 'beta' ? '/playbox/projects/mvmnt_beta/' : '/'
```

This third base path only activates with `--mode beta` but nothing in `package.json` scripts mentions it. Future you (or a collaborator) might not know it exists.

---

### 9. `package.json` name doesn't match the project

```json
"name": "midi-social-visualizer-react"
```

vs the project being called **MVMNT**. This is cosmetically annoying when it shows up in npm error messages, lock files, or tooling output.

---

### 10. `__animationModules` variable exists purely for lint suppression

`note-animations/index.ts:13`:
```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __animationModules = import.meta.glob(['./*.ts', '!./template.ts'], { eager: true });
```

The `const` assignment with an `eslint-disable` comment is confusing because it looks like the variable might do something. The only reason it exists is so `import.meta.glob(...)` is a statement rather than a bare expression. Most readers' first instinct is to wonder "where is `__animationModules` used?" before finding the eslint suppression. This is fine as-is, but a brief comment like `// triggers side-effect registration in each animation file` directly on this line would make it obvious.

---

**Summary priority:**

| Severity | Issue |
|----------|-------|
| High | `_CheckExportedCapabilities` is a no-op — tests are the real guard |
| High | `resolve.alias` placed at wrong level (silently ignored) |
| Medium | `TimelineNoteEvent` leaks from state layer into SDK surface |
| Medium | `dist/` stale artifacts, three plugin dirs with no explanation |
| Low | `myplugin3/` gitignored, `beta` mode undocumented, `package.json` name mismatch, `__animationModules` comment |
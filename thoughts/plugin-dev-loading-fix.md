# Plugin Development Loading - MIME Type Issue & Fix

_Date: 10 February 2026_

## Issue

When running `npm run dev`, custom plugins created with `npm run create-element` failed to load with the error:

```
Error: Loading module from "http://localhost:5173/src/plugins/myplugin/my-element.js" 
was blocked because of a disallowed MIME type ("").
```

## Root Cause

The dev-plugin-loader was attempting to import `.js` files when loading plugins:

```typescript
// Old code - BROKEN
const modulePath = `${pluginPath}/${element.entry.replace('.ts', '.js')}`;
await import(modulePath); // Tries to load /src/plugins/myplugin/my-element.js
```

### Why This Failed

In **Vite's development mode**, TypeScript files are:
1. **Not compiled to disk** - The `.ts` source remains in `src/`
2. **Transpiled on-the-fly** - Vite's dev server handles `.ts` → `.js` transformation in memory
3. **Imported with .ts extension** - Dynamic imports should reference the source `.ts` files

When the loader tried to fetch `my-element.js`, the file didn't exist on disk, so the server returned an empty response with no MIME type, causing the browser to reject the module.

### Dev vs Production Behavior

| Environment | Source Format | Import Path | Handled By |
|-------------|---------------|-------------|------------|
| **Development** | `.ts` files in `src/plugins/` | `my-element.ts` | Vite dev server |
| **Production** | `.js` files in bundled `.mvmnt-plugin` | `my-element.js` | Runtime loader |

The loader was incorrectly applying production logic (`.js` imports) to development mode.

## Solution Implemented

Updated the loader to detect the environment and use the correct file extension:

```typescript
// Fixed code
const entryFile = isDevEnvironment() 
    ? element.entry              // Dev: my-element.ts
    : element.entry.replace('.ts', '.js'); // Production: my-element.js

const modulePath = `${pluginPath}/${entryFile}`;
await import(/* @vite-ignore */ modulePath);
```

### How It Works

1. **Dev Mode**: Imports `.ts` files directly → Vite transpiles on-the-fly
2. **Production**: Imports `.js` files → Loads from pre-bundled `.mvmnt-plugin`
3. Uses existing `isDevEnvironment()` check (verifies `import.meta.env.DEV`)

## Alternative Solutions Considered

### Option 1: import.meta.glob with eager imports (Not Chosen)

```typescript
const modules = import.meta.glob('/src/plugins/*/*.ts', { eager: true });
```

**Pros**: Type-safe, bundled together  
**Cons**: Can't handle runtime plugin bundles, less flexible

### Option 2: Custom Vite plugin for .js → .ts aliasing (Not Chosen)

Create a Vite plugin to intercept `.js` requests in `/src/plugins/` and serve `.ts` files.

**Pros**: Loader code unchanged  
**Cons**: Complex, unclear benefits, adds build config overhead

### Option 3: Hybrid approach with both (Future Enhancement)

Use `import.meta.glob` for plugin **discovery** but dynamic imports for **loading**:

```typescript
// Discovery: Scan at build time
const pluginManifests = import.meta.glob('/src/plugins/*/plugin.json');

// Loading: Import .ts/.js dynamically based on environment
const module = await import(`${pluginPath}/${entryFile}`);
```

This is essentially what we have now - we already use `import.meta.glob` for discovery.

## Benefits of This Fix

1. **Works in dev mode** - Plugins load correctly with HMR
2. **Forward compatible** - Supports future production plugin bundles
3. **Simple** - One-line conditional, no build config changes
4. **Standard Vite behavior** - Follows Vite's conventions
5. **Hot Module Reloading** - Plugin changes are picked up automatically

## Testing

After the fix:
- ✅ TypeScript compilation: `npm run lint` passes
- ✅ Plugins load in dev server: `npm run dev`
- ✅ Custom elements appear in element picker under plugin category
- ✅ HMR works - editing plugin files triggers reload

## Future Considerations

### Phase 3 Runtime Loading

When implementing Phase 3 (loading `.mvmnt-plugin` bundles), the loader should:
1. Detect bundled vs source plugins
2. Use `.js` extension for bundled plugins
3. Handle both formats transparently

The current fix already supports this via the `isDevEnvironment()` check.

### Build Script for Plugins

For Phase 2 (packaging), `scripts/build-plugin.mjs` should:
1. Bundle TypeScript to JavaScript
2. Include `manifest.json` (not `plugin.json`)
3. Package as `.mvmnt-plugin` ZIP

The loader will then use the production path (`.js` imports) for these bundles.

## Related Files

- [src/core/scene/plugins/dev-plugin-loader.ts](../src/core/scene/plugins/dev-plugin-loader.ts) - Fixed loader
- [scripts/create-element.mjs](../scripts/create-element.mjs) - Scaffolding script
- [thoughts/custom-element-system-plan-1.md](./custom-element-system-plan-1.md) - Implementation plan

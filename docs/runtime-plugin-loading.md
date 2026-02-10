# Runtime Plugin Loading API

The runtime plugin loading system allows loading and managing `.mvmnt-plugin` bundles at runtime.

## Usage

### Loading a Plugin

```typescript
import { loadPlugin } from '@core/scene/plugins';

// Load a plugin from a file
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.mvmnt-plugin';
fileInput.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    
    const buffer = await file.arrayBuffer();
    const result = await loadPlugin(buffer);
    
    if (result.success) {
        console.log('Plugin loaded:', result.pluginId);
        console.log('Registered elements:', result.registeredTypes);
    } else {
        console.error('Failed to load plugin:', result.error);
    }
};
fileInput.click();
```

### Unloading a Plugin

```typescript
import { unloadPlugin } from '@core/scene/plugins';

const result = await unloadPlugin('com.example.myplugin');
if (result.success) {
    console.log('Plugin unloaded successfully');
} else {
    console.error('Failed to unload plugin:', result.error);
}
```

### Checking Plugin State

```typescript
import { usePluginStore } from '@state/pluginStore';

// In a React component
function PluginManager() {
    const plugins = usePluginStore(state => state.plugins);
    const enablePlugin = usePluginStore(state => state.enablePlugin);
    const disablePlugin = usePluginStore(state => state.disablePlugin);
    
    return (
        <div>
            {Object.values(plugins).map(plugin => (
                <div key={plugin.manifest.id}>
                    <h3>{plugin.manifest.name}</h3>
                    <p>{plugin.manifest.description}</p>
                    <button onClick={() => 
                        plugin.enabled 
                            ? disablePlugin(plugin.manifest.id)
                            : enablePlugin(plugin.manifest.id)
                    }>
                        {plugin.enabled ? 'Disable' : 'Enable'}
                    </button>
                    {plugin.error && <p className="error">{plugin.error}</p>}
                </div>
            ))}
        </div>
    );
}
```

### Checking Element Registration

```typescript
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

// Check if an element type is available
if (sceneElementRegistry.hasElement('my-custom-element')) {
    console.log('Element is available');
}

// Check if it's a built-in or plugin element
if (sceneElementRegistry.isBuiltIn('my-custom-element')) {
    console.log('This is a built-in element');
} else {
    const pluginId = sceneElementRegistry.getPluginId('my-custom-element');
    console.log('This is from plugin:', pluginId);
}

// Get all available element types
const types = sceneElementRegistry.getAvailableTypes();
console.log('Available element types:', types);

// Get element info with metadata
const elementInfo = sceneElementRegistry.getElementTypeInfo();
elementInfo.forEach(info => {
    console.log(`${info.type}: ${info.name} (${info.category})`);
});
```

## Plugin Loading Flow

1. **User selects a `.mvmnt-plugin` file**
2. **File is read as ArrayBuffer**
3. **Plugin loader:**
   - Unzips the bundle using fflate
   - Reads and validates manifest.json
   - Checks MVMNT version compatibility
   - Loads and evaluates each element's bundled JS
   - Registers elements in the scene element registry
4. **Plugin state is saved to IndexedDB**
5. **Elements are immediately available in the UI**

## Error Handling

The plugin loader handles errors gracefully:

- **Version mismatch**: Plugin is rejected with a clear error message
- **Invalid manifest**: Plugin is rejected with validation errors
- **Element load failure**: Partial success if some elements load
- **Duplicate plugin**: New load is rejected if plugin already exists
- **Type collision**: Element registration fails if type conflicts with built-in

All errors are logged and stored in the plugin state for UI display.

## Version Compatibility

Plugins specify a `mvmntVersion` range in their manifest:

```json
{
  "mvmntVersion": "^0.14.0"
}
```

Supported range formats:
- `^1.0.0` - Caret range (>=1.0.0 <2.0.0)
- `~1.0.0` - Tilde range (>=1.0.0 <1.1.0)
- `>=1.0.0` - Greater than or equal
- `>=1.0.0 <2.0.0` - Compound range
- `1.0.0 || 2.0.0` - OR conditions

See [version-check.ts](../src/core/scene/plugins/version-check.ts) for implementation details.

## Persistence

Plugins are automatically persisted to IndexedDB and reloaded on app startup via `loadAllPluginsFromStorage()` called in [src/app/index.tsx](../src/app/index.tsx).

Failed plugins are disabled but remain in storage so users can:
- See error messages
- Update MVMNT version
- Remove the plugin

## Registry API

The `SceneElementRegistry` provides these methods for plugin management:

- `registerCustomElement(type, ElementClass, options)` - Register a plugin element
- `unregisterElement(type)` - Unregister a custom element
- `hasElement(type)` - Check if element exists
- `isBuiltIn(type)` - Check if element is built-in
- `getPluginId(type)` - Get plugin ID for custom element
- `unregisterPlugin(pluginId)` - Unregister all elements from a plugin

These are used internally by the plugin loader but can also be used for advanced scenarios.

## Testing

See test files for usage examples:
- [version-check.test.ts](../src/core/scene/plugins/__tests__/version-check.test.ts)
- [registry-plugin-api.test.ts](../src/core/scene/registry/__tests__/registry-plugin-api.test.ts)

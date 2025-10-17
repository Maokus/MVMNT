# Files to Modify for Deleting AudioFeatureDescriptorInput

This document lists all files that would need to be modified to completely remove the `AudioFeatureDescriptorInput` component and all related handling code from the MVMNT codebase.

## Summary

The AudioFeatureDescriptorInput is currently **unused by any scene elements** but has integration points throughout the form system, type definitions, and property panel rendering logic. Deleting it would require cleaning up these integration points while preserving the underlying `AudioFeatureDescriptor` type which is still heavily used by the audio system.

## Files to Delete Entirely

### 1. Component File

-   **`src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx`**
    -   The main component implementation (~930 lines)
    -   Contains all UI logic for feature selection, channel management, smoothing controls

### 2. Test File

-   **`src/workspace/form/inputs/__tests__/AudioFeatureDescriptorInput.test.tsx`**
    -   Unit tests for the component
    -   Test fixtures and helper functions

## Files to Modify

### Core Type Definitions

#### 1. `src/core/types.ts`

**Lines to modify:**

-   **Line 209**: Remove `'audioFeatureDescriptor'` from `ConfigSchemaProperty.type` union
-   **Line 264**: Remove `'audioFeatureDescriptor'` from `PropertyDefinition.type` union
-   **Lines 277-288**: Remove the following audioFeatureDescriptor-specific fields from `PropertyDefinition`:
    -   `trackPropertyKey?: string;`
    -   `requiredFeatureKey?: string;`
    -   `autoFeatureLabel?: string;`
    -   `profilePropertyKey?: string;`
    -   `glossaryTerms?: { featureDescriptor?: string; analysisProfile?: string; };`

**Note:** Keep `allowedTrackTypes` as it's used by `timelineTrackRef` type.

### Form Input System

#### 2. `src/workspace/form/inputs/FormInput.tsx`

**Lines to modify:**

-   **Line 5**: Remove import statement:
    ```typescript
    import AudioFeatureDescriptorInput from './AudioFeatureDescriptorInput';
    ```
-   **Lines 227-243**: Remove the entire conditional block:
    ```typescript
    if (type === 'audioFeatureDescriptor') {
        const descriptors = Array.isArray(value) ? value : value ? [value] : [];
        return (
            <AudioFeatureDescriptorInput
                id={id}
                value={descriptors.length ? descriptors : null}
                schema={schema}
                disabled={disabled}
                title={title}
                onChange={onChange}
            />
        );
    }
    ```

### Property Panel System

#### 3. `src/workspace/panels/properties/PropertyGroupPanel.tsx`

**Lines to modify:**

-   **Lines 291-306**: Remove audioFeatureDescriptor-specific schema handling in the `schemaForInput` computation:

    ```typescript
    const descriptorTrackId =
        property.type === 'audioFeatureDescriptor'
            ? values[property.trackPropertyKey ?? 'featureTrackId'] ?? null
            : null;
    const profileValue =
        property.type === 'audioFeatureDescriptor' && property.profilePropertyKey
            ? values[property.profilePropertyKey] ?? null
            : null;
    const schemaForInput = (() => {
        if (property.type === 'audioFeatureDescriptor') {
            return {
                ...property,
                trackId: descriptorTrackId,
                profileValue,
            };
        }
        // ... rest of function
    })();
    ```

-   **Lines 397-430**: Remove the special "Audio Binding" block rendering logic that groups `timelineTrackRef` + `audioFeatureDescriptor` properties:
    ```typescript
    if (property.type === 'timelineTrackRef') {
        const next = properties[index + 1];
        const descriptorKey = next?.type === 'audioFeatureDescriptor' ? next.trackPropertyKey ?? property.key : null;
        if (next?.type === 'audioFeatureDescriptor' && descriptorKey === property.key) {
            propertyRows.push(
                <div
                    key={`${property.key}-audio-binding`}
                    className="ae-audio-binding-block"
                    style={{...}}
                >
                    <div className="ae-audio-binding-header" style={{ fontWeight: 600 }}>
                        Audio Binding
                    </div>
                    <div className="ae-audio-binding-copy" style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        Select an audio track and feature descriptor to drive this element.
                    </div>
                    {renderPropertyRow(property)}
                    {renderPropertyRow(next, { nested: true })}
                </div>,
            );
            index += 1;
            continue;
        }
    }
    ```

## Files NOT to Modify

The following files reference `AudioFeatureDescriptor` (the type) but NOT the input component. These should be left alone as they are part of the core audio system:

### Core Audio System (Keep as-is)

-   `src/audio/features/audioFeatureTypes.ts` - Type definition
-   `src/audio/features/analysisIntents.ts` - Intent system
-   `src/core/scene/elements/audioFeatureUtils.ts` - Utility functions
-   `src/core/scene/elements/audio-spectrum.ts` - Scene element
-   `src/core/scene/elements/audio-oscilloscope.ts` - Scene element
-   `src/core/scene/elements/audio-volume-meter.ts` - Scene element

### State Management (Keep as-is)

-   `src/state/sceneStore.ts` - Scene state with descriptor handling
-   `src/state/audioDiagnosticsStore.ts` - Audio diagnostics

### Migrations & Persistence (Keep as-is)

-   `src/persistence/migrations/unifyChannelField.ts` - Legacy migration

### Utilities (Keep as-is)

-   `src/utils/audioVisualization/history.ts` - History tracking

### Documentation (Optional Update)

-   `docs/audio/audio-cache-system.md` - Contains reference at line 456

    -   **Action**: Update or remove the section about "Audio Feature Descriptor Input" UI component
    -   Keep all other documentation about descriptors themselves

-   `thoughts/as-implementation-3.md` - Implementation plan document
    -   **Action**: Add note that this UI component was removed as unused infrastructure

## Testing Strategy After Deletion

After making these changes, run:

```bash
# Ensure no TypeScript errors
npm run build

# Run all tests to ensure nothing breaks
npm run test

# Run linter
npm run lint
```

### Expected Test Impacts

-   Removal of AudioFeatureDescriptorInput tests (intentional)
-   No other test failures expected since no scene elements use this input type

### Manual Verification

1. Open the property inspector for any scene element
2. Verify that all existing property types still render correctly
3. Verify that audio elements (spectrum, oscilloscope, volume meter) still work
4. No `audioFeatureDescriptor` properties should appear in any element schemas

## Risk Assessment

**Risk Level: LOW**

### Why it's safe to delete:

1. No scene elements currently define properties with `type: 'audioFeatureDescriptor'`
2. The component is only referenced by the form system infrastructure
3. The underlying `AudioFeatureDescriptor` type is still used extensively and is NOT being deleted
4. All audio elements hardcode their descriptors instead of exposing them as configurable properties

### What to watch out for:

1. If future development adds properties with `type: 'audioFeatureDescriptor'`, the form system will fail silently (no component to render)
2. Type definitions in `PropertyDefinition` will need cleanup to remove unused fields
3. The "Audio Binding" block UI in PropertyGroupPanel will become dead code (never triggers)

## Rollback Strategy

If needed, this deletion can be easily rolled back:

1. All changes are removals, not modifications to existing logic
2. Git can restore the deleted files: `git checkout HEAD -- src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx`
3. Restore the removed code blocks from git history

## Related Future Work

If this component is removed, consider:

1. **Complete the deletion**: Also remove the special "Audio Binding" block styling/layout from PropertyGroupPanel since it will never be used
2. **Documentation audit**: Update all docs that reference this UI component as a feature
3. **Type cleanup**: Consider removing the `glossaryTerms`, `trackPropertyKey`, `requiredFeatureKey`, `autoFeatureLabel`, and `profilePropertyKey` fields from `PropertyDefinition` if they're truly unused

## Conclusion

This is dormant infrastructure that was built for a future declarative audio binding system that was never fully implemented. Scene elements instead hardcode their audio feature descriptors. Removing it would clean up the codebase without impacting any current functionality.

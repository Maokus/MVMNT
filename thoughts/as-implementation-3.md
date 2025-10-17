# Audio System Simplification: Complete Implementation Plan

_Status: Planning_  
_Created: 17 October 2025_

## Overview

This plan refactors the audio cache system to dramatically simplify the developer experience while preserving all existing capabilities. The core goals are:

1. **Unified Channel Specification**: Replace dual `channelIndex`/`channelAlias` fields with a single `channel` parameter
2. **Implicit Intent Management**: Enable lazy/automatic analysis request emission without manual lifecycle wiring
3. **Declarative Scene Elements**: Allow elements to declare audio needs, with automatic subscription handling
4. **Simplified Profile Handling**: Default to standard analysis profiles, hiding complexity from common use cases
5. **Clean Migration Path**: Ensure existing scenes and configurations continue to work

## Phase 1: Unified Channel Specification

**Goal**: Replace `channelIndex` and `channelAlias` with a single `channel` field that accepts numbers or strings.

### Actions

1. **Update `AudioFeatureDescriptor` type** (`src/audio/features/audioFeatureTypes.ts`)

    - Replace `channelIndex?: number` and `channelAlias?: string` with `channel?: number | string | null`
    - Add JSDoc explaining that `channel` can be numeric (0, 1) or semantic ("Left", "Right", "Mono")
    - Document that `null` or omission defaults to mono/merged channel

2. **Create unified channel resolver** (`src/audio/features/channelResolution.ts` - new file)

    - Implement `resolveChannel(channel: number | string | null, trackChannelConfig)` that:
        - Returns numeric index for number inputs
        - Maps string aliases ("Left", "Right", "Mono", etc.) to indices based on track configuration
        - Returns 0 for null/undefined (default to mono)
    - Include validation and helpful error messages for invalid channels

3. **Update descriptor ID builders** (`src/audio/features/analysisIntents.ts`)

    - Modify `buildDescriptorId` to use the new `channel` field
    - Modify `buildDescriptorMatchKey` similarly
    - Ensure cache key generation produces consistent results with old system

4. **Update sampling utilities** (`src/core/scene/elements/audioFeatureUtils.ts`)

    - Replace `resolveChannelIndexFromDescriptor` with new `resolveChannel` function
    - Update `buildSampleCacheKey` to use `channel` field
    - Update `sampleFeatureFrame` to resolve channel once and use throughout

5. **Update UI components** (`src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx`)

    - _Decision (14 February 2026)_: The legacy component was removed instead of refactored because no scene elements expose an
      audio feature descriptor input. Follow-up notes live in `thoughts/delete-af-input-2.md`.

6. **Create migration utility** (`src/persistence/migrations/unifyChannelField.ts` - new file)

    - Implement `migrateDescriptorChannels(descriptor)` that converts old format to new
    - Handle both `channelIndex` → `channel` and `channelAlias` → `channel`
    - Apply to all descriptors found in scene state during hydration

7. **Update diagnostics** (`src/state/audioDiagnosticsStore.ts`)
    - Modify `collectCachedDescriptorInfos` to use `channel` field
    - Display channel information consistently in diagnostics UI

### Acceptance Criteria

-   ✅ `AudioFeatureDescriptor` has single `channel` field; old fields removed
-   ✅ All descriptor creation uses new `channel` format
-   ✅ Channel resolution works for numeric indices, string aliases, and null/undefined
-   ✅ Existing scenes load correctly with automatic migration
-   ✅ Cache keys remain stable (no unnecessary re-analysis)
-   ✅ UI shows unified channel selector
-   ✅ Tests pass for all channel resolution scenarios

### Verification Commands

```bash
npm run test -- AudioFeatureDescriptor
npm run test -- channelResolution
npm run lint
```

---

## Phase 2: Centralized Descriptor Creation & Profile Defaulting

**Goal**: Provide single source of truth for descriptor creation with smart defaults; hide profile complexity from common usage.

### Actions

1. **Create descriptor builder** (`src/audio/features/descriptorBuilder.ts` - new file)

    - Implement `createFeatureDescriptor(options)` function:
        - Required: `feature` (string key)
        - Optional: `channel`, `smoothing`, `bandIndex`, `calculatorId`, `profile`
        - Looks up defaults from feature registry
        - Applies default profile (`'default'`) if not specified
        - Returns complete, normalized descriptor
    - Add overload accepting partial descriptor for updates
    - Include TypeScript types for builder options

2. **Extend feature registry** (`src/audio/features/audioFeatureRegistry.ts`)

    - Add `getDefaultProfile()` method returning `'default'`
    - Add `getFeatureDefaults(featureKey)` returning default smoothing, bands, etc.
    - Document that custom profiles are advanced usage

3. **Remove old coercion utilities** (`src/core/scene/elements/audioFeatureUtils.ts`)

    - Delete `coerceFeatureDescriptor` function
    - Delete `coerceFeatureDescriptors` function
    - Add deprecation notice in comments if phased removal needed

4. **Update all descriptor creation sites**

    - Replace `coerceFeatureDescriptor(...)` calls with `createFeatureDescriptor(...)`
    - Replace manual descriptor object literals with builder calls
    - Search for: `featureKey:`, `channelIndex:`, `channelAlias:` to find all sites

5. **Update analysis intent publisher** (`src/audio/features/analysisIntents.ts`)

    - Modify `publishAnalysisIntent` to accept optional `profile` parameter
    - Default `profile` to result of `getDefaultProfile()` if not provided
    - Update all callers to omit profile in common cases

6. **Update documentation**
    - Add JSDoc to `createFeatureDescriptor` explaining each option
    - Document that `profile` is optional and defaults to `'default'`
    - Note that custom profiles are for advanced performance tuning

### Acceptance Criteria

-   ✅ `createFeatureDescriptor` is sole method for creating descriptors
-   ✅ All descriptor sites use builder, not manual construction
-   ✅ Profile parameter is optional in all public APIs
-   ✅ Default profile is applied automatically when omitted
-   ✅ Feature registry provides consistent defaults
-   ✅ Old coercion functions removed from codebase
-   ✅ Tests verify default application and override capability

### Verification Commands

```bash
npm run test -- descriptorBuilder
npm run test -- analysisIntents
npm run build
npm run lint
```

---

## Phase 3: Lazy Intent Emission & Implicit Subscription

**Goal**: Enable developers to sample audio data without manually emitting analysis intents; system handles subscriptions automatically.

### Actions

1. **Create lazy scene API module** (`src/audio/features/sceneApi.ts` - new file)

    - Implement `getFeatureData(trackId, feature, options, time)`:
        - `feature`: string key or full descriptor
        - `options`: optional `{ channel?, smoothing?, profile? }`
        - Internally calls `createFeatureDescriptor` to normalize
        - Checks if intent already published for this element/track/descriptor
        - If not, publishes intent immediately (lazy initialization)
        - Calls existing `sampleFeatureFrame` to get data
        - Returns `{ values, metadata }` or `null` if not ready
    - Implement intent tracking per calling element:
        - Maintain WeakMap of element → Set<intent signatures>
        - Automatically publish intents on first `getFeatureData` call
        - Provide explicit `clearFeatureData(element, trackId?)` for cleanup

2. **Add element lifecycle integration** (`src/core/scene/elements/BaseSceneElement.ts`)

    - Add `onDestroy()` hook to base element class
    - Automatically call `clearFeatureData(this)` in `onDestroy()`
    - Ensure all elements inherit this cleanup behavior

3. **Create React hook** (`src/audio/features/useAudioFeature.ts` - new file)

    - Implement `useAudioFeature(trackId, feature, options)`:
        - Returns `(time: number) => FeatureData | null`
        - Manages intent emission on mount
        - Cleans up intent on unmount or dependency change
        - Uses `useRef` to track current element/component identity
        - Provides loading state: `{ getData: (time) => data, isLoading: boolean }`

4. **Update scene elements to use lazy API**

    - Refactor `audio-spectrum.ts`:
        - Remove manual `emitAnalysisIntent` calls
        - Replace with `getFeatureData` in render method
        - Remove manual cleanup code
    - Refactor `audio-oscilloscope.ts` similarly
    - Refactor `audio-volume-meter.ts` similarly
    - Refactor any other audio-reactive elements

5. **Maintain explicit API for advanced use**

    - Keep `publishAnalysisIntent` and `clearAnalysisIntent` exported
    - Document as "advanced usage" for custom lifecycle management
    - Provide example of when explicit control is needed

6. **Add intent management diagnostics**
    - Update diagnostics store to show auto-managed vs explicit intents
    - Provide warning if intents leak (not cleaned up after element removal)
    - Add debug logging for intent emission/cleanup

### Acceptance Criteria

-   ✅ `getFeatureData` automatically emits intents on first call
-   ✅ Intents tracked per element with automatic cleanup
-   ✅ Base element class handles cleanup on destruction
-   ✅ `useAudioFeature` hook works in React components with proper cleanup
-   ✅ All built-in scene elements use lazy API
-   ✅ No manual intent emission in scene element code
-   ✅ Explicit API still available and documented
-   ✅ No intent leaks after element removal
-   ✅ Tests cover lazy initialization and cleanup

### Verification Commands

```bash
npm run test -- sceneApi
npm run test -- useAudioFeature
npm run test -- BaseSceneElement
npm run test -- audio-spectrum
npm run test -- audio-oscilloscope
npm run build
npm run lint
```

---

## Phase 4: Declarative Scene Element Configuration

**Goal**: Allow scene elements to declare audio feature dependencies in their configuration, with automatic subscription management.

### Actions

1. **Extend scene element property schema** (`src/core/scene/elements/BaseSceneElement.ts`)

    - Add `audioFeatures` property type:
        ```typescript
        audioFeatures?: Array<{
          feature: string;
          channel?: number | string;
          smoothing?: number;
          profile?: string;
        }>
        ```
    - Add `featureTrackId` standard property (already exists in some elements)

2. **Create declarative subscription manager** (`src/audio/features/declarativeSubscriptions.ts` - new file)

    - Implement `syncElementSubscriptions(element, trackId, features)`:
        - Compares current subscriptions against declared `features`
        - Publishes new intents for added features
        - Clears intents for removed features
        - Called automatically when `audioFeatures` or `featureTrackId` properties change

3. **Add property change detection** (`src/core/scene/elements/BaseSceneElement.ts`)

    - Implement `onPropertyChanged(key, oldValue, newValue)` hook
    - When `audioFeatures` or `featureTrackId` changes:
        - Call `syncElementSubscriptions` automatically
    - Ensure existing property system triggers this hook

4. **Create helper for declarative sampling** (`src/audio/features/sceneApi.ts`)

    - Add `getElementFeature(element, featureIndex, time)`:
        - Reads `element.audioFeatures[featureIndex]`
        - Reads `element.featureTrackId`
        - Calls `getFeatureData` with these values
        - Returns feature data or null
    - Simplifies sampling: just provide feature index

5. **Update scene element examples**

    - Refactor `audio-spectrum.ts` to use declarative approach:
        - Define `audioFeatures` property with spectrogram descriptor
        - Use `getElementFeature(this, 0, time)` to sample
        - Remove all manual subscription code
    - Provide side-by-side comparison in documentation

6. **Create migration helper for existing elements**

    - Implement `convertToDeclarative(element)` that:
        - Analyzes current feature usage
        - Generates `audioFeatures` property value
        - Returns suggested property configuration

7. **Add validation and warnings**
    - Warn if element uses `getFeatureData` without declaring features
    - Error if `audioFeatures` references invalid feature keys
    - Provide helpful messages for configuration mistakes

### Acceptance Criteria

-   ✅ Elements can declare `audioFeatures` property
-   ✅ Subscriptions sync automatically when properties change
-   ✅ `getElementFeature` provides simple sampling from declarations
-   ✅ At least one built-in element uses declarative approach
-   ✅ Property changes properly trigger re-subscription
-   ✅ Documentation shows declarative pattern
-   ✅ Validation catches configuration errors
-   ✅ Tests verify automatic sync and cleanup

### Verification Commands

```bash
npm run test -- declarativeSubscriptions
npm run test -- BaseSceneElement
npm run test -- audio-spectrum
npm run build
npm run lint
```

---

## Phase 5: Complete Scene Element Migration

**Goal**: Migrate all built-in scene elements to use the new simplified APIs; establish patterns for custom elements.

### Actions

1. **Audit all audio-reactive elements**

    - List all scene elements that use audio features
    - Categorize by complexity (simple, medium, complex)
    - Prioritize simple elements for declarative approach

2. **Migrate simple elements** (use declarative approach)

    - `audio-volume-meter.ts`: Single RMS feature
    - `audio-waveform.ts`: Single waveform feature
    - Convert to `audioFeatures` property declarations
    - Use `getElementFeature` for sampling

3. **Migrate medium elements** (use lazy API)

    - `audio-oscilloscope.ts`: Multiple waveform samples
    - `audio-spectrum.ts`: Spectrogram with options
    - Use `getFeatureData` without explicit intents
    - Remove manual lifecycle management

4. **Remove legacy patterns**

    - Search codebase for `emitAnalysisIntent` calls
    - Replace all with new APIs
    - Remove if found in scene element code
    - Keep only in test utilities and advanced examples

5. **Update element creation wizard**

    - If element templates/wizard exists, update to use new patterns
    - Provide template showing declarative approach
    - Include comments explaining simplified workflow

6. **Create migration guide**
    - Document step-by-step conversion process
    - Provide before/after code examples
    - List common pitfalls and solutions
    - Include TypeScript types for new APIs

### Acceptance Criteria

-   ✅ All built-in audio elements use new APIs
-   ✅ No scene elements manually call `emitAnalysisIntent`
-   ✅ Simple elements use declarative approach
-   ✅ Complex elements use appropriate API level
-   ✅ Element templates updated
-   ✅ Migration guide available
-   ✅ Code examples for each pattern
-   ✅ All element tests passing

### Verification Commands

```bash
npm run test -- src/core/scene/elements/
npm run build
npm run lint
```

---

## Phase 6: State Migration & Persistence

**Goal**: Ensure existing projects load correctly; persist new format going forward.

### Actions

1. **Implement state migration** (`src/persistence/migrations/audioSystemV3.ts` - new file)

    - Create `migrateSceneAudioDescriptors(sceneState)`:
        - Walks scene element tree
        - Applies channel field unification
        - Converts `features` properties to new format
        - Returns migrated scene state
    - Add version check to run migration once

2. **Update scene store hydration** (`src/state/sceneStore.ts`)

    - Add migration step in state initialization
    - Call `migrateSceneAudioDescriptors` for old versions
    - Update version marker after migration
    - Log migration for user feedback

3. **Update persistence serialization** (`src/persistence/`)

    - Ensure new descriptor format is serialized correctly
    - Remove legacy field serialization
    - Add version stamp for future migrations

4. **Test with real project files**

    - Load actual user projects from various versions
    - Verify automatic migration works
    - Check that visuals render identically
    - Confirm no data loss

5. **Add migration verification**

    - Implement `verifyMigration(oldState, newState)`:
        - Ensures all descriptors converted
        - Checks no data lost
        - Validates descriptor integrity
    - Run in development mode

6. **Handle edge cases**
    - Scenes with no audio elements (skip migration)
    - Malformed descriptors (use defaults)
    - Custom/unknown feature types (preserve as-is)
    - Multi-version projects (progressive migration)

### Acceptance Criteria

-   ✅ Old scenes load correctly with automatic migration
-   ✅ Visual output identical before/after migration
-   ✅ New scenes save in new format
-   ✅ Migration is one-time and transparent
-   ✅ Edge cases handled gracefully
-   ✅ Migration verification catches issues
-   ✅ Version markers updated correctly
-   ✅ Tests cover migration scenarios

### Verification Commands

```bash
npm run test -- audioSystemV3
npm run test -- sceneStore
npm run build
```

---

## Phase 7: Testing & Validation

**Goal**: Comprehensive test coverage for all new APIs and migration paths.

### Actions

1. **Unit tests for core utilities**

    - `channelResolution.test.ts`: All channel resolution scenarios
    - `descriptorBuilder.test.ts`: Builder with various options
    - `sceneApi.test.ts`: Lazy intent emission and cleanup
    - `declarativeSubscriptions.test.ts`: Property sync logic

2. **Integration tests for scene elements**

    - Test each migrated element in isolation
    - Verify feature data flows correctly
    - Check lifecycle cleanup
    - Test with various track configurations (mono, stereo, multi-channel)

3. **Migration tests**

    - Create fixture scenes with old format
    - Verify automatic migration
    - Check visual output matches
    - Test progressive migrations (v1→v2→v3)

4. **React hook tests**

    - Test `useAudioFeature` with React Testing Library
    - Verify mount/unmount cleanup
    - Test dependency changes
    - Check loading states

5. **Diagnostic tests**

    - Verify diagnostics show correct intent states
    - Test leak detection
    - Check performance metrics unchanged

6. **End-to-end tests**

    - Create scene using new APIs
    - Export video
    - Verify audio-visual sync
    - Test with various audio files

7. **Performance benchmarks**
    - Compare performance before/after refactor
    - Ensure no regression in analysis speed
    - Verify memory usage stable
    - Test with large projects

### Acceptance Criteria

-   ✅ All new utilities have unit tests
-   ✅ All migrated elements have integration tests
-   ✅ Migration has comprehensive test coverage
-   ✅ React hooks tested properly
-   ✅ Diagnostics verified
-   ✅ E2E tests pass
-   ✅ No performance regression
-   ✅ Test coverage >80% for new code

### Verification Commands

```bash
npm run test
npm run test -- --coverage
npm run build
npm run lint
```

---

## Phase 8: Documentation & Developer Experience

**Goal**: Complete, clear documentation for the new system; excellent onboarding for new developers.

### Actions

1. **Update primary documentation** (`docs/audio/audio-cache-system.md`)

    - Rewrite "Usage" section with new APIs
    - Show lazy API first (simplest)
    - Progress to declarative approach
    - Cover advanced explicit API last
    - Remove references to old coercion utilities

2. **Create quick-start guide** (`docs/audio/quickstart.md` - new file)

    - "Using audio in 5 minutes"
    - Simple example with `getFeatureData`
    - React hook example
    - Link to full documentation

3. **Add API reference** (`docs/audio/api-reference.md` - new file)

    - List all public functions with signatures
    - Document parameters and return types
    - Provide usage examples for each
    - Include TypeScript types

4. **Create migration guide** (`docs/audio/migration-v3.md` - new file)

    - Explain changes from v2
    - Step-by-step migration instructions
    - Common patterns (before/after)
    - Troubleshooting section

5. **Add inline JSDoc comments**

    - Document all public APIs
    - Include usage examples in JSDoc
    - Link to relevant documentation pages
    - Ensure VSCode IntelliSense helpful

6. **Create video tutorial** (optional but recommended)

    - Record screen capture showing new workflow
    - Demonstrate creating audio-reactive element
    - Show difference from old approach
    - Upload to project documentation site

7. **Update README examples**

    - Ensure README shows current best practices
    - Update code samples to new APIs
    - Link to quick-start guide

8. **Write changelog entry**
    - Document breaking changes
    - List new APIs
    - Explain migration process
    - Highlight benefits

### Acceptance Criteria

-   ✅ Primary documentation fully updated
-   ✅ Quick-start guide available
-   ✅ API reference complete
-   ✅ Migration guide written
-   ✅ All public APIs have JSDoc
-   ✅ README examples current
-   ✅ Changelog entry written
-   ✅ Documentation reviewed by team

### Verification Commands

```bash
# Build docs if you have a doc generator
npm run docs:build
# Manual review of documentation files
```

---

## Phase 9: Polish & Release Preparation

**Goal**: Final polish, validation, and preparation for release.

### Actions

1. **Code review**

    - Review all changed files
    - Check for consistency in naming
    - Verify error messages are helpful
    - Ensure TypeScript types are accurate

2. **Deprecation warnings**

    - If keeping legacy APIs temporarily, add deprecation warnings
    - Use `console.warn` in development mode
    - Point to migration documentation

3. **Performance optimization**

    - Profile intent management overhead
    - Optimize WeakMap lookups if needed
    - Ensure no unnecessary re-analysis
    - Benchmark against baseline

4. **Developer tools integration**

    - Update diagnostics panel UI
    - Show intent source (lazy, declarative, explicit)
    - Highlight potential issues
    - Provide suggestions for optimization

5. **Error messages**

    - Review all error messages
    - Ensure they're helpful and actionable
    - Include links to documentation where appropriate
    - Test error scenarios

6. **Edge case handling**

    - Test with unusual track configurations
    - Test with missing audio files
    - Test with corrupted cache
    - Test with invalid descriptors

7. **Release checklist**
    - All tests passing
    - Documentation complete
    - Changelog written
    - Version bumped appropriately
    - Migration tested on real projects

### Acceptance Criteria

-   ✅ Code review complete
-   ✅ Deprecation warnings in place (if applicable)
-   ✅ Performance meets or exceeds baseline
-   ✅ Developer tools updated
-   ✅ Error messages validated
-   ✅ Edge cases handled
-   ✅ Backward compatibility verified
-   ✅ Release checklist complete

### Verification Commands

```bash
npm run test
npm run build
npm run lint
# Manual testing of various scenarios
```

---

## Success Metrics

After implementation, the refactored system should achieve:

1. **Reduced Code Complexity**

    - Average scene element uses ≤5 lines for audio integration
    - Zero manual intent management in 80%+ of elements
    - No descriptor coercion calls in scene code

2. **Improved Developer Experience**

    - New developer can add audio feature in <10 minutes
    - API is "obvious" without reading docs (for common cases)
    - TypeScript autocomplete provides clear guidance

3. **Maintained Performance**

    - No regression in analysis speed
    - Memory usage stable or improved
    - Frame rate unchanged

4. **Complete Migration**

    - 100% of built-in elements use new APIs
    - All tests passing
    - Documentation complete

5. **User Transparency**
    - Existing projects open without user action
    - Visual output identical
    - No breaking changes for end users

## Rollback Plan

If critical issues are discovered:

1. **Before Release**: Revert all changes via version control
2. **After Release**:
    - Provide emergency patch with legacy API restored
    - Add feature flag to enable/disable new system
    - Give users time to report issues
    - Fix issues and re-release

## Open Questions

-   Should we maintain legacy API indefinitely or deprecate after X versions?
-   Do we need feature flag for gradual rollout?
-   Should migration be automatic or require user confirmation?
-   What's the support timeline for old descriptor format?

## Conclusion

This plan delivers on all goals from the original simplification proposal:

1. ✅ **Unified channel specification** - Single `channel` field
2. ✅ **Lazy intent emission** - `getFeatureData` handles subscriptions
3. ✅ **Declarative configuration** - `audioFeatures` property with auto-sync
4. ✅ **Simplified profiles** - Defaults to `'default'`, hidden from common usage
5. ✅ **Clean migration** - Automatic, transparent, tested

The result is a dramatically simpler API that maintains full flexibility for advanced use cases while making the common case trivial.

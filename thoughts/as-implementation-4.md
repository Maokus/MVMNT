# Audio System Simplification: Revised Implementation Plan (v4)

_Status: Phase 7 Complete_
_Created: 17 October 2025_  
_Revision: 4 - Addresses Phase 4 concerns from as-implementation-3-comments_

## Changes from v3

This revision addresses critical issues identified in Phase 4 of the v3 plan:

1. **Audio features as internal metadata**: Feature requirements are now element implementation details, not user-configurable properties
2. **Smoothing refactored**: Removed from `AudioFeatureDescriptor`, made purely a runtime sampling option
3. **Clear separation**: User config (visual/behavioral) vs. data dependencies (internal/automatic)
4. **Simplified mental model**: Users configure visuals, elements manage their data needs internally

---

## Phase 4: Remove Smoothing from Descriptors

**Goal**: Refactor smoothing from an analysis-time descriptor property to a pure runtime sampling parameter, reducing cache complexity and enabling per-element smoothing variations.

### Rationale

Currently, `smoothing` exists in both:

-   `AudioFeatureDescriptor.smoothing` (stored in descriptor)
-   Runtime options passed to `getFeatureData()`

This creates:

-   **Cache key pollution**: Same feature + different smoothing = separate cache entries
-   **Inflexibility**: Multiple elements can't apply different smoothing to same data
-   **Conceptual confusion**: Mixing data specification with presentation parameters

**Smoothing is a view-time operation**, not analysis-time. It should be applied when sampling, not when requesting analysis.

### Actions

1. **Update `AudioFeatureDescriptor` type** (`src/audio/features/audioFeatureTypes.ts`)

    - Remove `smoothing?: number | null` from descriptor interface
    - Add migration note in comments explaining removal
    - Update JSDoc to clarify descriptor is for **data specification only**

2. **Create sampling options type** (`src/audio/features/audioFeatureTypes.ts`)

    ```typescript
    /**
     * Runtime options for sampling audio feature data.
     * These affect HOW data is presented, not WHAT data is analyzed.
     */
    export interface AudioSamplingOptions {
        /** Smoothing radius for temporal averaging (0 = no smoothing) */
        smoothing?: number;
        /** Interpolation method between frames */
        interpolation?: 'linear' | 'nearest' | 'cubic';
    }
    ```

3. **Update `getFeatureData` signature** (`src/audio/features/sceneApi.ts`)

    - Change from: `getFeatureData(element, trackId, feature, options, time)`
    - To: `getFeatureData(element, trackId, feature, time, samplingOptions?)`
    - `options` now only contains descriptor fields (channel, bandIndex, etc.)
    - `samplingOptions` is separate parameter for runtime presentation
    - Maintains backward compatibility by detecting old call signature

4. **Refactor smoothing application** (`src/audio/view-adapters/tempoAlignedViewAdapter.ts`)

    - Remove smoothing from descriptor cache key generation
    - Apply smoothing in the sampling layer after frame retrieval
    - Implement `applySmoothingWindow(frames, radius)` helper
    - Keep smoothing logic but decouple from descriptor identity

5. **Update descriptor ID builders** (`src/audio/features/analysisIntents.ts`)

    - Remove smoothing from `buildDescriptorId` calculation
    - Remove smoothing from `buildDescriptorMatchKey` calculation
    - **Result**: Same feature with different smoothing values = same cache entry ✅

6. **Update all scene elements**

    - `audio-spectrum.ts`: Pass smoothing as sampling option, not in descriptor
    - `audio-oscilloscope.ts`: Similarly refactor if uses smoothing
    - Search codebase for smoothing usage in descriptors

    ```typescript
    // Before:
    const sample = getFeatureData(this, trackId, 'spectrogram', { smoothing }, targetTime);

    // After:
    const smoothing = this.getProperty<number>('smoothing') ?? 0;
    const sample = getFeatureData(this, trackId, 'spectrogram', targetTime, { smoothing });
    ```

7. **Update UI components** (`src/workspace/form/inputs/AudioFeatureDescriptorInput.tsx`)

    - Remove smoothing control from descriptor editor
    - Smoothing remains in element property editors (where it belongs)
    - Update help text explaining smoothing is per-element, not per-descriptor

8. **Create migration for saved descriptors** (`src/persistence/migrations/removeSmoothingFromDescriptor.ts`)

    - Strip `smoothing` field from loaded descriptors
    - If element has descriptor with smoothing, migrate to element property
    - Log migration actions for transparency

### Acceptance Criteria

-   ✅ `AudioFeatureDescriptor` has no `smoothing` field
-   ✅ `AudioSamplingOptions` type created and documented
-   ✅ `getFeatureData` accepts sampling options as separate parameter
-   ✅ Smoothing applied at sampling time, not descriptor time
-   ✅ Cache keys no longer include smoothing
-   ✅ Same feature data shared across elements with different smoothing
-   ✅ All scene elements refactored to new pattern
-   ✅ UI updated to reflect new mental model
-   ✅ Migration handles existing saved descriptors
-   ✅ Tests verify cache sharing and independent smoothing

**Implementation Notes (Oct 2025)**

-   Runtime sampling now uses `AudioSamplingOptions` to apply smoothing outside descriptor identity.
-   Scene import/export migrates legacy descriptor smoothing into per-element `smoothing` bindings.
-   Workspace descriptor editor no longer exposes smoothing controls; elements manage smoothing in their property editors.

### Verification Commands

```bash
npm run test -- audioFeatureTypes
npm run test -- sceneApi
npm run test -- tempoAlignedViewAdapter
npm run test -- audio-spectrum
npm run build
npm run lint
```

---

## Phase 5: Internal Element Feature Requirements

**Goal**: Establish audio feature requirements as internal element metadata, not user-configurable properties, maintaining clear separation between implementation details and user settings.

### Rationale

From the comments document:

> **Config schemas are meant for user-configurable properties**  
> **Audio subscriptions are developer concerns (which data to request)**  
> **Mixing them violates separation of concerns**

Elements should internally declare what data they need. Users should configure how that data is presented (colors, sizes, smoothing, etc.).

### Actions

1. **Create element feature metadata system** (`src/core/scene/elements/audioElementMetadata.ts` - new file)

    ```typescript
    /**
     * Internal metadata for audio feature requirements.
     * This is NOT user-configurable - it's implementation detail.
     */
    export interface AudioFeatureRequirement {
        /** Feature key (e.g., 'spectrogram', 'rms', 'waveform') */
        feature: string;
        /** Optional channel specification */
        channel?: number | string;
        /** Optional band index for multi-band features */
        bandIndex?: number;
        /** Optional calculator ID for custom analyzers */
        calculatorId?: string;
    }

    /**
     * Map of element type -> required features
     * Elements register their requirements here
     */
    const ELEMENT_FEATURE_REQUIREMENTS = new Map<string, AudioFeatureRequirement[]>();

    export function registerFeatureRequirements(elementType: string, requirements: AudioFeatureRequirement[]): void {
        ELEMENT_FEATURE_REQUIREMENTS.set(elementType, requirements);
    }

    export function getFeatureRequirements(elementType: string): AudioFeatureRequirement[] {
        return ELEMENT_FEATURE_REQUIREMENTS.get(elementType) || [];
    }
    ```

2. **Add automatic subscription on track assignment** (`src/core/scene/elements/BaseSceneElement.ts`)

    - Add protected method `_subscribeToRequiredFeatures()`:

        - Looks up requirements via `getFeatureRequirements(this.type)`
        - Gets `featureTrackId` from properties
        - Calls `syncElementSubscriptions()` to ensure intents published

    - Hook into property change detection:

        ```typescript
        protected override onPropertyChanged(key: string, oldValue: any, newValue: any): void {
            super.onPropertyChanged(key, oldValue, newValue);

            if (key === 'featureTrackId') {
                this._subscribeToRequiredFeatures();
            }
        }
        ```

    - Call in constructor after config applied:
        ```typescript
        constructor(type: string, id: string, config: Record<string, unknown>) {
            super(type, id, config);
            this._subscribeToRequiredFeatures();
        }
        ```

3. **Update element lifecycle** (`src/core/scene/elements/BaseSceneElement.ts`)

    - Add `onDestroy()` hook if not already present
    - Automatically call `clearFeatureData(this)` on destruction
    - Ensure cleanup happens for all elements

4. **Create subscription synchronization** (`src/audio/features/subscriptionSync.ts` - new file)

    ```typescript
    /**
     * Synchronizes element's audio subscriptions based on requirements.
     * Publishes intents for features the element needs.
     */
    export function syncElementSubscriptions(
        element: SceneElement,
        trackId: string | null,
        requirements: AudioFeatureRequirement[]
    ): void {
        if (!trackId) {
            // No track assigned, clear all subscriptions
            clearFeatureData(element);
            return;
        }

        // Get current subscriptions for this element
        const currentSubs = getElementSubscriptions(element);

        // Build target subscriptions from requirements
        const targetSubs = requirements.map((req) =>
            createFeatureDescriptor({
                feature: req.feature,
                channel: req.channel,
                bandIndex: req.bandIndex,
                calculatorId: req.calculatorId,
            })
        );

        // Add new subscriptions
        for (const descriptor of targetSubs) {
            if (!hasSubscription(element, trackId, descriptor)) {
                publishAnalysisIntent(element, trackId, descriptor);
            }
        }

        // Remove old subscriptions not in requirements
        for (const [subTrackId, descriptor] of currentSubs) {
            if (subTrackId === trackId && !isInRequirements(descriptor, targetSubs)) {
                clearAnalysisIntent(element, subTrackId, descriptor);
            }
        }
    }
    ```

5. **Register requirements in element implementations**

    Example for `audio-spectrum.ts`:

    ```typescript
    // At module level (top of file, after imports)
    import { registerFeatureRequirements } from './audioElementMetadata';

    registerFeatureRequirements('audioSpectrum', [{ feature: 'spectrogram' }]);

    export class AudioSpectrumElement extends SceneElement {
        constructor(id: string = 'audioSpectrum', config: Record<string, unknown> = {}) {
            super('audioSpectrum', id, config);
            // Subscriptions now automatic via base class
        }

        render(ctx: CanvasRenderingContext2D, time: number): void {
            const trackId = this.getProperty<string>('featureTrackId');
            if (!trackId) return;

            // Just sample - subscription already handled
            const smoothing = this.getProperty<number>('smoothing') ?? 0;
            const sample = getFeatureData(this, trackId, 'spectrogram', time, { smoothing });

            if (!sample) return;
            // ... render logic
        }
    }
    ```

6. **Update diagnostics** (`src/state/audioDiagnosticsStore.ts`)

    - Show whether subscriptions are auto-managed or explicit
    - Display element's declared requirements
    - Warn if manual subscriptions conflict with requirements

7. **Documentation updates**

    - Update architecture docs explaining internal metadata pattern
    - Provide guide for creating audio-reactive elements
    - Explain when to use explicit API vs auto-managed subscriptions

### Acceptance Criteria

-   ✅ Element metadata system created and functional
-   ✅ Elements can register feature requirements at module load
-   ✅ Base element class auto-subscribes based on requirements
-   ✅ Track ID changes trigger re-subscription
-   ✅ Element destruction cleans up subscriptions
-   ✅ Built-in audio elements use registration pattern
-   ✅ No user-facing `audioFeatures` config property
-   ✅ Clear separation: config = visuals, metadata = data dependencies
-   ✅ Diagnostics show auto-managed subscriptions
-   ✅ Tests verify automatic lifecycle management

### Verification Commands

```bash
npm run test -- audioElementMetadata
npm run test -- subscriptionSync
npm run test -- BaseSceneElement
npm run test -- audio-spectrum
npm run build
npm run lint
```

---

## Phase 6: Complete Scene Element Migration

**Goal**: Migrate all built-in scene elements to use internal metadata and simplified APIs; establish clear patterns for custom elements.

### Actions

1. **Audit all audio-reactive elements**

    - List all scene elements using audio features:

        - `audio-spectrum.ts`
        - `audio-oscilloscope.ts`
        - `audio-volume-meter.ts`

    - Document current subscription patterns
    - Identify manual intent management to remove

2. **Migrate simple elements** (single feature, standard usage)

    **`audio-volume-meter.ts`**:

    ```typescript
    registerFeatureRequirements('audioVolumeMeter', [{ feature: 'rms' }]);

    export class AudioVolumeMeterElement extends SceneElement {
        // Constructor: automatic subscription via base class

        render(ctx: CanvasRenderingContext2D, time: number): void {
            const trackId = this.getProperty<string>('featureTrackId');
            if (!trackId) return;

            const sample = getFeatureData(this, trackId, 'rms', time);
            if (!sample) return;

            const volume = sample.values[0];
            // ... render meter
        }
    }
    ```

3. **Migrate medium elements** (multiple features or options)

    **`audio-spectrum.ts`** (already shown in Phase 5)

    **`audio-oscilloscope.ts`**:

    ```typescript
    registerFeatureRequirements('audioOscilloscope', [
        { feature: 'waveform', channel: 'Left' },
        { feature: 'waveform', channel: 'Right' },
    ]);

    export class AudioOscilloscopeElement extends SceneElement {
        render(ctx: CanvasRenderingContext2D, time: number): void {
            const trackId = this.getProperty<string>('featureTrackId');
            if (!trackId) return;

            const leftSample = getFeatureData(this, trackId, 'waveform', time, {}, 'Left');
            const rightSample = getFeatureData(this, trackId, 'waveform', time, {}, 'Right');

            // ... render oscilloscope
        }
    }
    ```

4. **Handle dynamic requirements** (if needed)

    Some elements might need features based on config (e.g., user selects feature type).
    For these, use explicit API:

    ```typescript
    export class DynamicAudioElement extends SceneElement {
        private currentFeature: string | null = null;

        protected override onPropertyChanged(key: string, oldValue: any, newValue: any): void {
            super.onPropertyChanged(key, oldValue, newValue);

            if (key === 'selectedFeature' || key === 'featureTrackId') {
                this._updateSubscriptions();
            }
        }

        private _updateSubscriptions(): void {
            const trackId = this.getProperty<string>('featureTrackId');
            const feature = this.getProperty<string>('selectedFeature');

            if (!trackId || !feature) {
                clearFeatureData(this);
                return;
            }

            // Clear old subscription
            if (this.currentFeature) {
                clearAnalysisIntent(this, trackId, { feature: this.currentFeature });
            }

            // Add new subscription
            publishAnalysisIntent(this, trackId, { feature });
            this.currentFeature = feature;
        }
    }
    ```

5. **Remove legacy code patterns**

    - Search for manual `emitAnalysisIntent` calls in scene elements
    - Remove manual subscription tracking code
    - Remove manual cleanup in element code
    - Keep explicit API usage only where truly needed

6. **Update element templates** (if element wizard exists)

    - Create template showing registration pattern
    - Include comments explaining auto-subscription
    - Show both static and dynamic requirement patterns

7. **Create developer guide**

    Document in `docs/audio/creating-audio-elements.md`:

    - When to use automatic subscriptions (most cases)
    - When to use explicit API (dynamic requirements)
    - How to register requirements
    - How to sample data
    - Best practices for smoothing and other view parameters

### Acceptance Criteria

-   ✅ All built-in audio elements migrated
-   ✅ Simple elements use registration pattern
-   ✅ Complex elements use appropriate approach
-   ✅ No unnecessary manual intent management
-   ✅ Dynamic requirements handled correctly
-   ✅ Element templates updated
-   ✅ Developer guide created
-   ✅ Code examples for common patterns
-   ✅ All element tests passing

**Implementation Notes (Nov 2025)**

-   Audio spectrum, volume meter, and oscilloscope elements now rely solely on metadata-driven
    subscriptions and runtime sampling helpers.
-   Legacy `emitAnalysisIntent` utilities were removed from the codebase to prevent new manual
    subscription patterns.
-   Documentation updated with a dedicated guide for building audio-reactive elements and refreshed
    cache usage examples.

### Verification Commands

```bash
npm run test -- src/core/scene/elements/
npm run build
npm run lint
```

---

## Phase 7: State Migration & Persistence

**Goal**: Ensure existing projects load correctly; persist new format going forward.

### Actions

1. **Implement state migration** (`src/persistence/migrations/audioSystemV4.ts` - new file)

    ```typescript
    /**
     * Migrates audio system to v4:
     * 1. Removes smoothing from descriptors
     * 2. Migrates smoothing to element properties
     * 3. Removes user-facing audioFeatures properties (if any)
     * 4. Unifies channel fields (from v3)
     */
    export function migrateSceneAudioSystemV4(sceneState: any): any {
        const migrated = { ...sceneState };

        // Walk element tree
        migrated.elements = migrateElements(sceneState.elements || []);

        return migrated;
    }

    function migrateElements(elements: any[]): any[] {
        return elements.map((element) => {
            const migrated = { ...element };

            // Migrate child elements recursively
            if (element.children) {
                migrated.children = migrateElements(element.children);
            }

            // Remove smoothing from any stored descriptors
            if (element.config?.audioFeatures) {
                migrated.config.audioFeatures = element.config.audioFeatures.map((feature: any) => {
                    const { smoothing, ...rest } = feature;

                    // If element doesn't have smoothing property, add it
                    if (smoothing !== undefined && !element.config.smoothing) {
                        migrated.config.smoothing = smoothing;
                    }

                    return rest;
                });

                // Remove audioFeatures property entirely (now internal)
                delete migrated.config.audioFeatures;
            }

            // Unify channel fields (channelIndex/channelAlias -> channel)
            // ... from Phase 1 migration

            return migrated;
        });
    }
    ```

2. **Update scene store hydration** (`src/state/sceneStore.ts`)

    - Add v4 migration to version check sequence
    - Run migrations in order: v1 → v2 → v3 → v4
    - Update schema version marker to 4
    - Log migration for user feedback

3. **Update persistence serialization** (`src/persistence/`)

    - Ensure descriptors serialize without smoothing
    - Don't serialize internal audioFeatures metadata
    - Add schema version 4 marker

4. **Test with real project files**

    - Create test fixtures for v1, v2, v3 formats
    - Verify automatic migration chain works
    - Check visual output identical
    - Confirm smoothing values preserved

5. **Add migration verification**

    ```typescript
    function verifyV4Migration(oldState: any, newState: any): boolean {
        // Check no descriptors have smoothing field
        // Check elements with smoothing descriptors now have smoothing property
        // Check audioFeatures removed from config
        // Validate all subscriptions still functional
    }
    ```

6. **Handle edge cases**

    - Elements with custom feature requirements (preserve)
    - Malformed smoothing values (use default 0)
    - Missing featureTrackId (allow, subscriptions happen on assignment)
    - Legacy elements without metadata registration (warn in dev mode)

### Acceptance Criteria

-   ✅ Old scenes load correctly with automatic migration
-   ✅ Visual output identical before/after migration
-   ✅ Smoothing values preserved as element properties
-   ✅ New scenes save in v4 format
-   ✅ Migration is one-time and transparent
-   ✅ Edge cases handled gracefully
-   ✅ Migration verification catches issues
-   ✅ Version markers updated correctly
-   ✅ Tests cover all migration scenarios

### Verification Commands

```bash
npm run test -- audioSystemV4
npm run test -- sceneStore
npm run build
npm run lint
```

---

## Phase 8: Testing & Validation

**Goal**: Comprehensive test coverage for all refactored components and migration paths.

### Actions

1. **Unit tests for core utilities**

    - `audioSamplingOptions.test.ts`: Sampling options handling
    - `audioElementMetadata.test.ts`: Registration and retrieval
    - `subscriptionSync.test.ts`: Sync logic and edge cases
    - `smoothingApplication.test.ts`: Runtime smoothing application

2. **Integration tests for scene elements**

    - Test automatic subscription on construction
    - Verify subscription on track ID change
    - Check cleanup on element destruction
    - Test with various track configurations
    - Verify smoothing applied correctly at sample time

3. **Migration tests**

    - Test v3 → v4 migration
    - Test progressive migration v1 → v4
    - Verify smoothing preservation
    - Check audioFeatures property removal
    - Validate visual output matches

4. **Cache behavior tests**

    - Verify same feature with different smoothing = same cache entry
    - Test multiple elements using same data with different smoothing
    - Check cache key generation excludes smoothing
    - Ensure no cache duplication

5. **Lifecycle tests**

    - Test element construction subscribes correctly
    - Test track ID change re-subscribes
    - Test element destruction cleans up
    - Test dynamic requirement changes
    - Check for subscription leaks

6. **Diagnostic tests**

    - Verify diagnostics show auto-managed vs explicit
    - Test requirement display in diagnostics
    - Check leak detection works
    - Validate metadata inspection

7. **Performance benchmarks**

    - Compare cache efficiency before/after
    - Verify no regression in analysis speed
    - Check memory usage (should improve with less cache duplication)
    - Test with large projects

### Acceptance Criteria

-   ✅ All new utilities have unit tests
-   ✅ All migrated elements have integration tests
-   ✅ Migration has comprehensive test coverage
-   ✅ Cache behavior verified
-   ✅ Lifecycle tests pass
-   ✅ Diagnostics verified
-   ✅ No performance regression
-   ✅ Cache efficiency improved
-   ✅ Test coverage >80% for new code

### Verification Commands

```bash
npm run test
npm run test -- --coverage
npm run build
npm run lint
```

---

## Phase 9: Documentation & Developer Experience

**Goal**: Complete, clear documentation explaining the new mental model and development patterns.

### Actions

1. **Update primary documentation** (`docs/audio/audio-cache-system.md`)

    - Rewrite "Architecture" section explaining separation of concerns
    - Document internal metadata pattern
    - Explain smoothing as runtime parameter
    - Show lazy API usage
    - Cover explicit API for dynamic requirements
    - Remove references to old patterns

2. **Create quick-start guide** (`docs/audio/quickstart.md` - new file)

    ````markdown
    # Audio Features Quick Start

    ## For Simple Elements (Recommended)

    1. Register your requirements:

    ```typescript
    registerFeatureRequirements('myElement', [{ feature: 'spectrogram' }]);
    ```
    ````

    2. Sample in render:

    ```typescript
    render(ctx, time) {
        const trackId = this.getProperty('featureTrackId');
        if (!trackId) return;

        const sample = getFeatureData(this, trackId, 'spectrogram', time);
        if (!sample) return;

        // Use sample.values
    }
    ```

    That's it! Subscriptions are automatic.

    ```

    ```

3. **Add conceptual guide** (`docs/audio/concepts.md` - new file)

    Explain:

    - **Data vs Presentation**: Features are data, smoothing is presentation
    - **Internal vs External**: Element requirements are internal, user config is external
    - **Automatic vs Explicit**: When the system handles subscriptions, when you need control
    - **Cache Efficiency**: How removing smoothing from descriptors improves sharing

4. **Create migration guide** (`docs/audio/migration-v4.md` - new file)

    - List all breaking changes
    - Explain smoothing refactor rationale
    - Show before/after code examples
    - Provide migration checklist
    - Common pitfalls and solutions

5. **Add inline JSDoc comments**

    - Document all public APIs
    - Explain `AudioSamplingOptions`
    - Document registration functions
    - Include usage examples
    - Link to relevant docs

6. **Update README examples**

    - Show current best practices
    - Use registration pattern in examples
    - Demonstrate lazy API
    - Link to quick-start guide

7. **Write changelog entry**

    ```markdown
    ## v4.0.0 - Audio System Refactor

    ### Breaking Changes

    -   **Smoothing removed from descriptors**: Smoothing is now a runtime sampling option, not part of the feature descriptor. This improves cache efficiency and flexibility.
    -   **Audio features now internal metadata**: Elements register their data requirements internally rather than exposing them as user configuration.

    ### Benefits

    -   **Better cache efficiency**: Same feature data shared across elements with different smoothing
    -   **Clearer mental model**: Separation between data dependencies and visual configuration
    -   **Simpler element code**: Automatic subscription management in most cases
    -   **More flexible**: Different elements can apply different smoothing to same data

    ### Migration

    Existing projects automatically migrate. See [migration guide](docs/audio/migration-v4.md) for developer migration steps.
    ```

8. **Create architecture diagram** (optional but helpful)

    Visual showing:

    - Element → Internal Metadata → Auto Subscription
    - Element Config → User Properties (smoothing, colors, etc.)
    - Sampling Options → Runtime Application
    - Cache Key excludes smoothing

### Acceptance Criteria

-   ✅ Primary documentation fully updated
-   ✅ Quick-start guide available
-   ✅ Conceptual guide explains mental model
-   ✅ Migration guide complete
-   ✅ All public APIs have JSDoc
-   ✅ README examples current
-   ✅ Changelog entry written
-   ✅ Documentation reviewed

### Verification Commands

```bash
# Manual review of documentation files
# Verify links work
# Check code examples compile
```

---

## Phase 10: Polish & Release Preparation

**Goal**: Final polish, validation, and preparation for release.

### Actions

1. **Code review**

    - Review all changed files
    - Check naming consistency
    - Verify error messages helpful
    - Ensure TypeScript types accurate
    - Validate separation of concerns maintained

2. **Deprecation handling**

    - If maintaining backward compatibility:
        - Add deprecation warnings for old patterns
        - Point to migration documentation
        - Set deprecation timeline
    - Otherwise, clean removal in v4

3. **Performance optimization**

    - Profile subscription management overhead
    - Optimize registration lookup if needed
    - Verify cache efficiency gains realized
    - Benchmark against baseline

4. **Developer tools integration**

    - Update diagnostics panel UI
    - Show element metadata (registered requirements)
    - Display subscription source (auto vs explicit)
    - Highlight cache sharing opportunities
    - Provide optimization suggestions

5. **Error messages**

    - Review all error messages
    - Ensure helpful and actionable
    - Include links to documentation
    - Test error scenarios:
        - Element without registration (dev warning)
        - Invalid feature key
        - Track not found
        - Descriptor creation errors

6. **Edge case handling**

    - Test with unusual track configurations
    - Test with missing audio files
    - Test with corrupted cache
    - Test with invalid descriptors
    - Test dynamic requirement changes
    - Test rapid track switching

7. **Release checklist**

    - [ ] All tests passing
    - [ ] Documentation complete
    - [ ] Changelog written
    - [ ] Version bumped (v4.0.0)
    - [ ] Migration tested on real projects
    - [ ] Performance benchmarks acceptable
    - [ ] No memory leaks
    - [ ] Cache efficiency improved
    - [ ] Breaking changes clearly documented

### Acceptance Criteria

-   ✅ Code review complete
-   ✅ Deprecation strategy implemented
-   ✅ Performance meets or exceeds baseline
-   ✅ Developer tools updated
-   ✅ Error messages validated
-   ✅ Edge cases handled
-   ✅ Backward compatibility clear
-   ✅ Release checklist complete

### Verification Commands

```bash
npm run test
npm run build
npm run lint
# Manual testing of various scenarios
# Performance profiling
```

---

## Success Metrics

After implementation, the refactored system should achieve:

1. **Reduced Code Complexity**

    - Average scene element: ≤3 lines for audio integration (register + sample)
    - Zero manual subscription management in 90%+ of elements
    - No smoothing in descriptors (removed entirely)

2. **Improved Cache Efficiency**

    - Fewer duplicate cache entries (same feature, different smoothing)
    - Measured reduction in memory usage for projects with multiple audio elements
    - Faster cache lookups (simpler keys)

3. **Clearer Mental Model**

    - Data dependencies = internal element concern
    - Visual parameters = user configuration
    - No confusion between descriptor and sampling options

4. **Maintained Developer Experience**

    - New developer can add audio feature in <10 minutes
    - Registration pattern is straightforward
    - TypeScript autocomplete guides correctly

5. **Maintained Performance**

    - No regression in analysis speed
    - Memory usage improved (less cache duplication)
    - Frame rate unchanged or better

6. **Complete Migration**

    - 100% of built-in elements use new patterns
    - All tests passing
    - Documentation complete
    - Real projects tested

7. **User Transparency**

    - Existing projects open without user action
    - Visual output identical
    - No breaking changes for end users

## Rollback Plan

If critical issues are discovered:

1. **Before Release**: Revert all changes via version control

2. **After Release**:
    - Emergency patch with v3 API restored
    - Feature flag to enable/disable v4 system
    - Give users time to report issues
    - Fix issues and re-release

## Comparison with v3 Plan

### What Changed

**v3 Phase 4**: Declarative Scene Element Configuration

-   Added `audioFeatures` to user config
-   Users could edit feature requirements
-   Mixed data dependencies with visual configuration

**v4 Phase 4-5**: Internal Metadata + Smoothing Refactor

-   Audio features as **internal element metadata**
-   Smoothing **removed from descriptors**
-   Clear separation: implementation vs configuration
-   Automatic subscription management without user-facing properties

### Why v4 is Better

1. **No Conceptual Confusion**

    - Users configure visuals (colors, sizes, smoothing)
    - Elements declare data needs (internal)
    - Clear boundary between concerns

2. **Better Cache Efficiency**

    - Smoothing removed from cache keys
    - Same feature data shared across elements
    - Less memory usage, better performance

3. **Simpler for Users**

    - Users can't accidentally break subscriptions
    - No confusing `audioFeatures` property
    - Just configure visual parameters

4. **Simpler for Developers**
    - Registration pattern is straightforward
    - Automatic subscription management
    - No manual lifecycle wiring

## Open Questions

-   Should we provide utility to inspect element's registered requirements at runtime?
-   Do we need migration tool for custom elements in user projects?
-   Should diagnostics show cache efficiency metrics?
-   What's the policy for elements with dynamic requirements?

## Conclusion

This revised plan addresses the fundamental issues identified in the v3 Phase 4 analysis:

1. ✅ **Audio features as internal metadata** - Not user-configurable
2. ✅ **Smoothing removed from descriptors** - Pure runtime parameter
3. ✅ **Clear separation of concerns** - Data vs presentation
4. ✅ **Better cache efficiency** - Reduced duplication
5. ✅ **Maintained simplicity** - Easy for both users and developers

The result is a cleaner architecture that maintains all the simplification benefits of v3 while avoiding the conceptual confusion of mixing user configuration with implementation details.

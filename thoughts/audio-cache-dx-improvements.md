# Audio Cache Developer Experience Improvements

**Date**: October 12, 2025  
**Status**: Planning  
**Goal**: Simplify the audio feature API for scene element developers and enable runtime analysis parameter adjustments from the Scene Analysis Caches tab

---

## Current State Analysis

### What Scene Element Developers Do Today

To use audio features in a scene element, developers must:

1. **Import multiple utilities**:

    ```ts
    import {
        coerceFeatureDescriptors,
        emitAnalysisIntent,
        sampleFeatureFrame,
        resolveTimelineTrackRefValue,
    } from '@core/scene/elements/audioFeatureUtils';
    import type { AudioFeatureDescriptor } from '@audio/features/audioFeatureTypes';
    ```

2. **Handle track binding resolution manually**:

    ```ts
    const trackBinding = this.getBinding('featureTrackId');
    const trackValue = this.getProperty<string | string[] | null>('featureTrackId');
    const trackId = resolveTimelineTrackRefValue(trackBinding, trackValue);
    ```

3. **Coerce and validate descriptors**:

    ```ts
    const descriptorsValue = this.getProperty<AudioFeatureDescriptor[] | null>('features');
    const descriptors = coerceFeatureDescriptors(descriptorsValue, DEFAULT_DESCRIPTOR);
    ```

4. **Emit analysis intents**:

    ```ts
    const analysisProfileId = this.getProperty<string>('analysisProfileId') ?? null;
    emitAnalysisIntent(this, trackId, analysisProfileId, descriptors);
    ```

5. **Sample feature data manually**:
    ```ts
    const sample = sampleFeatureFrame(trackId, descriptor, targetTime);
    const values = sample?.values ?? [];
    ```

### Pain Points

1. **Too many imports and boilerplate**: Developers need to remember 4-5 utility functions and the correct order to call them
2. **Error-prone manual orchestration**: Easy to forget `emitAnalysisIntent` or pass wrong parameters
3. **Unclear failure modes**: When data is unavailable, developers get `null` without clear diagnostics
4. **Channel resolution complexity**: Aliasing logic is buried in helper functions
5. **Verbose property definitions**: Config schemas repeat similar audio property patterns
6. **No runtime parameter control**: Analysis parameters (FFT size, hop size, window) are set once and can't be adjusted without cache invalidation
7. **Analysis profile mismatch**: Profiles are loosely coupled to descriptors; mismatches cause silent failures or stale cache warnings

---

## Goals

### Primary Goals

1. **Reduce cognitive load**: Provide a single high-level API that handles the entire audio feature lifecycle
2. **Enable runtime tweaking**: Allow users to adjust analysis parameters from UI without full reanalysis
3. **Improve error visibility**: Surface missing data, stale caches, and configuration errors clearly
4. **Unify configuration**: Standardize how audio properties are consumed across elements via the controller
5. **Smooth migration**: Move all existing audio elements to the new system in lockstep

### Secondary Goals

6. **Better documentation**: Generate TypeScript types that guide developers
7. **Stronger validation**: Catch descriptor/profile mismatches at development time
8. **Performance optimization**: Reduce redundant sampling and intent emissions

---

## Proposed Solution

### Part 1: Audio Feature Controller Abstraction

Introduce a single **controller class** that encapsulates the audio feature workflow for scene elements. This controller is responsible for binding resolution, descriptor coercion, intent emission, sampling, and diagnostics.

```ts
import { AudioFeatureController } from '@core/scene/elements/audioFeatureController';

export class MySpectrumElement extends SceneElement {
    private audioController = new AudioFeatureController(this, {
        trackProperty: 'audioTrackId',
        descriptorProperty: 'features',
        profileProperty: 'analysisProfileId',
        defaultDescriptor: { featureKey: 'spectrogram', smoothing: 0 },
    });

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const layers = this.audioController.sampleAll(targetTime);

        return layers.flatMap((layer) => {
            if (!layer.ready) return [];

            return layer.values.map((value, i) => new Rectangle(i * 10, 0, 8, value * 100, layer.color));
        });
    }
}
```

#### API Design

```ts
interface AudioFeatureController {
    // Main method: handles everything
    sampleAll(targetTime: number): AudioFeatureSample[];

    // Access individual layers
    sampleLayer(index: number, targetTime: number): AudioFeatureSample | null;

    // Query state
    isReady(): boolean;
    getStatus(): AudioFeatureStatus;

    // Advanced: history sampling
    sampleHistory(targetTime: number, count: number): AudioFeatureHistorySample[];
}

interface AudioFeatureSample {
    ready: boolean;
    values: number[];
    metadata: FeatureMetadata;
    descriptor: AudioFeatureDescriptor;
    color: string; // Auto-generated from channel palette
    status: {
        warning?: string;
        isStale?: boolean;
        isFallback?: boolean;
    };
}
```

**Benefits**:

-   **Single import**: One controller handles everything
-   **Automatic intent emission**: No need to manually call `emitAnalysisIntent`
-   **Built-in diagnostics**: Status object surfaces warnings and fallbacks
-   **Channel color palette**: Automatic color assignment for multi-channel visualizations
-   **Type safety**: Full TypeScript support with intellisense

---

### Part 2: Runtime Analysis Parameter Adjustment

Currently, analysis parameters (FFT size, hop size, window type) are baked into caches. Changing them requires:

1. Clearing the cache
2. Re-running analysis (expensive)
3. Losing other valid feature tracks

**Proposed: Incremental Reanalysis**

Allow per-calculator parameter updates with smart merging:

#### UI Changes (SceneAnalysisCachesTab)

```tsx
<AnalysisParameterEditor
    sourceId={sourceId}
    calculator="mvmnt.spectrogram"
    currentParams={{
        windowSize: 2048,
        hopSize: 512,
        fftSize: 2048,
        minDecibels: -80,
        maxDecibels: 0,
    }}
    onUpdateParams={(newParams) => {
        // Smart reanalysis: only update spectrogram track
        store.updateCalculatorParams(sourceId, 'mvmnt.spectrogram', newParams);
    }}
/>
```

#### Backend Changes

```ts
// In timelineStore
updateCalculatorParams(
    audioSourceId: string,
    calculatorId: string,
    params: Partial<AnalysisParams>
) {
    const cache = this.audioFeatureCaches[audioSourceId];
    if (!cache) return;

    // 1. Update profile or create new one
    const profileId = `custom-${Date.now()}`;
    cache.analysisProfiles[profileId] = {
        id: profileId,
        ...cache.analysisProfiles['default'],
        ...params,
    };

    // 2. Mark only affected tracks as stale
    Object.values(cache.featureTracks).forEach(track => {
        if (track.calculatorId === calculatorId) {
            // Stale this track only
            this.invalidateFeatureTrack(audioSourceId, track.key);
        }
    });

    // 3. Trigger reanalysis of single calculator
    this.reanalyzeAudioFeatureCalculators(audioSourceId, [calculatorId], profileId);
}
```

**Analysis Profile Versioning**

```ts
interface AudioFeatureAnalysisProfile {
    id: string;
    label?: string;
    windowSize: number;
    hopSize: number;
    fftSize?: number;
    // ... other params

    // New fields
    parentProfileId?: string; // Track derivation
    createdAt?: number;
    isUserDefined: boolean;
}
```

**UI for Parameter Adjustment**:

```tsx
function AnalysisParameterPanel({ sourceId, calculatorId }) {
    const calculator = audioFeatureCalculatorRegistry.get(calculatorId);
    const currentTrack = useCurrentTrack(sourceId, calculator.featureKey);

    const [localParams, setLocalParams] = useState(currentTrack.analysisParams);
    const isDirty = !isEqual(localParams, currentTrack.analysisParams);

    return (
        <div>
            <h4>{calculator.label} Parameters</h4>

            <NumberInput
                label="FFT Size"
                value={localParams.fftSize}
                onChange={(v) => setLocalParams({ ...localParams, fftSize: v })}
                options={[512, 1024, 2048, 4096, 8192]}
            />

            <NumberInput
                label="Hop Size"
                value={localParams.hopSize}
                onChange={(v) => setLocalParams({ ...localParams, hopSize: v })}
            />

            {isDirty && (
                <div>
                    <Button onClick={() => handleApply(localParams)}>Apply & Reanalyze</Button>
                    <EstimatedTime params={localParams} />
                </div>
            )}
        </div>
    );
}
```

**Benefits**:

-   **Fast iteration**: Adjust FFT size without clearing entire cache
-   **Preserve work**: Keep RMS, waveform tracks while recomputing spectrogram
-   **Parameter exploration**: Users can experiment with quality/performance tradeoffs
-   **Profile management**: Save custom parameter sets for reuse

---

### Part 3: Smarter Analysis Intent System

The current intent bus is passive—it records what elements need but doesn't actively manage analysis.

**Proposed: Active Intent Resolution**

```ts
interface AnalysisIntentManager {
    // Current: passive recording
    publishIntent(elementId, trackId, profileId, descriptors);

    // New: active resolution
    resolveIntents(elementId: string): AnalysisResolution;

    // New: conflict detection
    detectProfileConflicts(): ProfileConflict[];

    // New: auto-fix
    suggestOptimalProfile(elementId: string): string | null;
}

interface AnalysisResolution {
    canSample: boolean;
    missingFeatures: string[];
    staleFeatures: string[];
    profileMismatch?: {
        requested: string;
        available: string;
        reason: string;
    };
    suggestedAction?: string;
}
```

**Integration with Controller**:

```ts
class AudioFeatureController {
    sampleAll(targetTime: number): AudioFeatureSample[] {
        // Emit intents
        this.emitIntents();

        // Check resolution before sampling
        const resolution = intentManager.resolveIntents(this.elementId);

        if (!resolution.canSample) {
            return this.descriptors.map((descriptor) => ({
                ready: false,
                values: [],
                metadata: {},
                descriptor,
                color: '#000',
                status: {
                    warning: resolution.suggestedAction,
                    isStale: resolution.staleFeatures.length > 0,
                },
            }));
        }

        // Proceed with sampling...
    }
}
```

**Benefits**:

-   **Early error detection**: Catch issues before rendering
-   **Actionable feedback**: Tell developers exactly what's wrong
-   **Auto-healing**: Suggest profile switches or trigger reanalysis
-   **Better diagnostics**: Centralized conflict resolution logic

---

### Part 4: Enhanced Scene Analysis Caches Tab

Current tab shows cache status but doesn't expose much control. Proposed enhancements:

#### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ Analysis Caches                                     │
│ Monitor audio feature processing and control params │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─ Track: "My Audio.mp3" ────────────────────────┐ │
│ │ Status: Ready ✓        Updated: 12:34 PM      │ │
│ │                                                │ │
│ │ Analysis Profile: Default ▼                    │ │
│ │   Window: 2048  Hop: 512  FFT: 2048           │ │
│ │   [Create Custom Profile...]                   │ │
│ │                                                │ │
│ │ Feature Tracks:                                │ │
│ │   ✓ Spectrogram (2.1 MB) [Parameters] [⟳]    │ │
│ │   ✓ RMS Loudness (62 KB)              [⟳]    │ │
│ │   ✓ Waveform (124 KB)                 [⟳]    │ │
│ │                                                │ │
│ │ Active Elements: 3                             │ │
│ │   • Spectrum Visualizer (spectrogram)         │ │
│ │   • Volume Meter (rms)                        │ │
│ │   • Waveform Display (waveform)               │ │
│ │                                                │ │
│ │ [Reanalyze All] [Clear Cache] [Export...]     │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### New Features

1. **Per-Track Parameter Editor**:

    - Expand each feature track row to show calculator-specific params
    - Live preview of param changes (estimate reanalysis time)
    - Apply changes without clearing entire cache

2. **Profile Manager**:

    - Create custom profiles from current settings
    - Duplicate/rename profiles
    - Apply profile to multiple tracks at once
    - Export/import profiles for sharing

3. **Dependency Viewer**:

    - Show which scene elements depend on each feature track
    - Highlight elements that will break if track is deleted
    - Navigate to element config from cache tab

4. **Cache Statistics**:

    - Memory usage per track
    - Frame count and temporal resolution
    - Frequency resolution (for spectrograms)
    - Analysis time and performance metrics

5. **Batch Operations**:
    - Select multiple tracks
    - Apply profile to selection
    - Reanalyze selection
    - Export selection as template

#### Component Structure

```tsx
<SceneAnalysisCachesTab>
    <TrackCacheList>
        <TrackCacheCard>
            <TrackHeader />
            <ProfileSelector />
            <FeatureTrackList>
                <FeatureTrackRow>
                    <FeatureTrackStats />
                    <ParameterEditor /> {/* Expandable */}
                    <ActionButtons />
                </FeatureTrackRow>
            </FeatureTrackList>
            <DependencyList />
            <BatchActions />
        </TrackCacheCard>
    </TrackCacheList>
    <ProfileManager /> {/* Sidebar or modal */}
</SceneAnalysisCachesTab>
```

---

## Implementation Plan

### Phase 1: Controller Foundation & Migration (Week 1)

**Goal**: Ship the controller abstraction and move every existing audio scene element onto it immediately.

**Tasks**:

1. Implement `AudioFeatureController` with end-to-end handling of track resolution, descriptor coercion, intent emission, sampling, caching, and teardown.
2. Migrate current audio scene elements (Spectrum, Volume Meter, Oscilloscope, etc.) to use the controller in the same pull request, removing legacy utility imports.
3. Add unit and integration coverage that exercises sampling, diagnostics, and intent emission through the controller.

**Success Criteria**:

-   All existing audio elements compile and run solely through the controller API.
-   Legacy helpers are no longer referenced by migrated elements.
-   Controller tests cover happy path and missing-data scenarios.

### Phase 2: Diagnostics & Intent Resolution (Week 2)

**Goal**: Provide actionable status information before sampling and expose it through the controller.

**Tasks**:

1. Extend `AudioFeatureSample` with concise status metadata (warnings, stale/fallback flags, resolution hints).
2. Add `AnalysisIntentManager.resolveIntents()` to compute readiness, missing resources, and suggested fixes.
3. Integrate resolution results into controller sampling so visualizers receive diagnostics alongside data.

**Success Criteria**:

-   Controller can short-circuit sampling when data is unavailable and returns status details.
-   Diagnostics panel reflects intent resolution state changes.
-   Tests cover stale caches, missing tracks, and profile mismatches.

### Phase 3: Parameter Editing UI (Week 3)

**Goal**: Let users tweak calculator parameters directly from the Scene Analysis Caches tab.

**Tasks**:

1. Build `AnalysisParameterEditor` with validated inputs (FFT size, hop size, window, etc.) and dirty-state tracking.
2. Embed the editor in each feature-track row with clear affordances for apply/reset actions.
3. Style the UI to match existing workspace patterns and remain usable in narrow layouts.

**Success Criteria**:

-   Users can adjust parameters, see pending changes, and submit updates per track.
-   Validation prevents unsupported combinations and communicates issues inline.
-   UI snapshots/tests cover core interactions.

### Phase 4: Incremental Reanalysis Backend (Week 3)

**Goal**: Recompute only the affected audio calculators when parameters change.

**Tasks**:

1. Implement `updateCalculatorParams()` in the timeline store to generate updated analysis profiles, mark affected tracks stale, and trigger targeted reanalysis.
2. Allow `reanalyzeAudioFeatureCalculators()` to accept calculator subsets and optional profile overrides.
3. Ensure unaffected feature tracks retain their cached data and metadata.

**Success Criteria**:

-   Parameter changes reprocess only the necessary calculators.
-   Cache diffing shows untouched tracks remain valid.
-   Automated tests cover single-track updates and multi-track safety.

### Phase 5: Profile Management UI (Week 4)

**Goal**: Manage built-in and user-defined analysis profiles from the workspace.

**Tasks**:

1. Create a lightweight `ProfileManager` for listing, creating, renaming, duplicating, and deleting profiles.
2. Add profile selectors to cache cards so tracks can swap profiles quickly.
3. Persist custom profiles in timeline state and scene exports/imports.

**Success Criteria**:

-   Users can maintain a small library of profiles and assign them per track.
-   Profile changes propagate to dependent tracks immediately.
-   Export/import keeps custom profiles intact.

### Phase 6: Dependency Tracking & Visualization (Week 4)

**Goal**: Visualize which scene elements depend on each feature track.

**Tasks**:

1. Build a dependency graph tied to intent publications and controller sampling.
2. Display dependent elements within each track card, with navigation into their configuration.
3. Warn before destructive actions (delete, clear) when dependencies exist.

**Success Criteria**:

-   Dependency views stay in sync as intents change.
-   Users can trace which elements will be affected by cache operations.
-   Tests cover dependency updates and guard-rail messaging.

### Phase 7: Documentation, QA, and Polish (Week 5)

**Goal**: Land with confidence and leave clear guidance for future contributors.

**Tasks**:

1. Update audio cache documentation with controller usage, diagnostics flow, parameter editing, and profile management walkthroughs.
2. Add JSDoc to all new public APIs and include before/after migration examples for typical elements.
3. Expand automated coverage (unit, integration, and targeted E2E) and run a performance sanity pass on sampling overhead.

**Success Criteria**:

-   Documentation explains the end-to-end experience for adding audio-driven visuals.
-   New tests push coverage above agreed thresholds and run green in CI.
-   Performance stays within current budgets, with any regressions addressed or noted.

---

## Migration Path for Existing Elements

### Before (Current Pattern)

```ts
export class AudioSpectrumElement extends SceneElement {
    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const trackBinding = this.getBinding('featureTrackId');
        const trackValue = this.getProperty<string | string[] | null>('featureTrackId');
        const descriptorsValue = this.getProperty<AudioFeatureDescriptor[] | null>('features');
        const descriptors = coerceFeatureDescriptors(descriptorsValue, DEFAULT_DESCRIPTOR);
        const trackId = resolveTimelineTrackRefValue(trackBinding, trackValue);
        const analysisProfileId = this.getProperty<string>('analysisProfileId') ?? null;

        emitAnalysisIntent(this, trackId, analysisProfileId, descriptors);

        const layerContexts = descriptors.map((descriptor) => {
            const sample = sampleFeatureFrame(trackId, descriptor, targetTime);
            const context = resolveFeatureContext(trackId, descriptor.featureKey);
            const metadata = this._resolveSpectrogramMetadata(context?.cache, context?.featureTrack);
            return { descriptor, sample, metadata };
        });

        // ... 100+ lines of rendering logic
    }
}
```

### After (With Controller)

```ts
export class AudioSpectrumElement extends SceneElement {
    private audioController = new AudioFeatureController(this, {
        trackProperty: 'featureTrackId',
        descriptorProperty: 'features',
        profileProperty: 'analysisProfileId',
        defaultDescriptor: { featureKey: 'spectrogram', smoothing: 0 },
    });

    protected _buildRenderObjects(config: any, targetTime: number): RenderObject[] {
        const layers = this.audioController.sampleAll(targetTime);

        // ... 100+ lines of rendering logic (unchanged)
        // But now `layers` has all needed data + status
    }
}
```

**Lines of code removed**: ~10-15 per element  
**Complexity reduced**: Import count drops from 5+ to 1

---

## API Reference

### AudioFeatureController

```ts
class AudioFeatureController {
    constructor(element: SceneElement, config: AudioControllerConfig);

    // Main sampling API
    sampleAll(targetTime: number): AudioFeatureSample[];
    sampleLayer(index: number, targetTime: number): AudioFeatureSample | null;

    // History sampling
    sampleHistory(targetTime: number, count: number, options?: HistorySamplingOptions): AudioFeatureHistorySample[];

    // State queries
    isReady(): boolean;
    getStatus(): AudioFeatureStatus;
    getTrackId(): string | null;
    getDescriptors(): AudioFeatureDescriptor[];

    // Advanced
    invalidate(): void; // Force re-emit intents
    dispose(): void; // Clear intents on unmount
}

interface AudioControllerConfig {
    trackProperty: string;
    descriptorProperty?: string;
    profileProperty?: string;
    defaultDescriptor: AudioFeatureDescriptor;
    autoEmitIntents?: boolean; // default: true
    cacheSamples?: boolean; // default: true
}

interface AudioFeatureSample {
    ready: boolean;
    values: number[];
    metadata: FeatureMetadata;
    descriptor: AudioFeatureDescriptor;
    color: string;
    status: {
        warning?: string;
        isStale?: boolean;
        isFallback?: boolean;
        resolution?: AnalysisResolution;
    };
}
```

## Risk Analysis

### Technical Risks

1. **Migration Scope**: Converting every element simultaneously could surface unexpected regressions

    - **Mitigation**: Land controller and element migrations in the same PR with exhaustive regression tests and fallback branches

2. **Performance Overhead**: Controller adds layer of abstraction

    - **Mitigation**: Profile performance, optimize hot paths, cache aggressively

3. **Complexity Increase**: More features = more code to maintain
    - **Mitigation**: Strong test coverage, clear documentation, simple public APIs

### UX Risks

4. **Parameter Confusion**: Users may not understand FFT size, hop size, etc.

    - **Mitigation**: Add tooltips, presets (Low/Medium/High quality), estimate impact

5. **Cache Invalidation Bugs**: Wrong params could break existing visualizations

    - **Mitigation**: Validate params before applying, allow rollback, show preview

6. **Profile Proliferation**: Users create too many custom profiles
    - **Mitigation**: Limit custom profiles (e.g., max 10), add cleanup UI

---

## Success Metrics

### Developer Experience

-   **Reduction in boilerplate**: Target 50%+ fewer lines in audio elements
-   **Fewer imports**: Drop from 5+ imports to 1-2
-   **Faster onboarding**: New developers can add audio elements in <15 minutes

### User Experience

-   **Parameter adjustment**: Users can tweak FFT size and see results in <10 seconds
-   **Error clarity**: 90%+ of "no audio data" issues have actionable error messages
-   **Profile adoption**: 50%+ of users create at least one custom profile

### Code Quality

-   **Test coverage**: 80%+ for new APIs
-   **Zero regressions**: All existing tests pass
-   **Documentation**: Every public API has JSDoc and example usage

---

## Alternatives Considered

### Alternative 1: Keep Status Quo

**Pros**: No migration effort, no risk of breaking changes  
**Cons**: Pain points persist, new developers struggle, no parameter tweaking

**Verdict**: ❌ Rejected – Current DX is too painful

### Alternative 2: Full Declarative API

Instead of a controller, use pure declarative bindings:

```tsx
<AudioSpectrum
    audio={{
        track: 'myTrackId',
        feature: 'spectrogram',
        profile: 'high-quality',
    }}
/>
```

**Pros**: Very simple for basic cases  
**Cons**: Limited flexibility, doesn't fit class-based elements, harder to optimize

**Verdict**: ❌ Rejected – Doesn't work with existing architecture

### Alternative 3: WebWorker Analysis

Move all analysis to background threads, never block main thread

**Pros**: Better performance, no UI freezing  
**Cons**: Complex serialization, harder debugging, doesn't solve DX issues

**Verdict**: 🤔 Defer to future optimization (doesn't solve core DX problems)

---

## Open Questions

1. **How to handle profile conflicts when multiple elements want different params?**

    - Option A: Warn user, suggest splitting into multiple tracks
    - Option B: Allow multiple profiles per track, use descriptor matching
    - Option C: Auto-reanalyze with superset of params (largest FFT, etc.)

    **Recommendation**: Option A (simplest, most explicit)

2. **Should we auto-generate profiles from descriptor requirements?**

    - E.g., if element needs 8192 FFT but default is 2048, create profile automatically?

    **Recommendation**: No – too implicit, users should choose

3. **How to version profiles when calculator versions change?**

    - Do we keep old profiles or force updates?

    **Recommendation**: Mark as "outdated" but don't delete, let user decide

4. **Should parameter changes trigger auto-reanalysis or require explicit "Apply"?**

    - Auto: Faster iteration, but expensive
    - Explicit: User control, but extra click

    **Recommendation**: Explicit with preview (show estimated time)

---

## Conclusion

This plan significantly improves the audio feature developer experience while adding powerful runtime parameter adjustment capabilities. The phased approach ensures minimal disruption to existing code while delivering value incrementally.

**Total estimated effort**: 5 weeks (1 developer)  
**Highest priority phases**: 1-4 (controller foundation, diagnostics, UI, and incremental reanalysis)  
**Stretch phases**: 5-6 (profile management and dependency visualization)

Once complete, MVMNT will have:

-   ✅ Simple, one-line audio feature API for scene elements
-   ✅ Runtime parameter tweaking without full reanalysis
-   ✅ Clear error messages and status indicators
-   ✅ Unified configuration patterns across all audio elements
-   ✅ Better tooling for managing analysis caches

This positions MVMNT as a best-in-class audio visualization platform with excellent developer ergonomics.

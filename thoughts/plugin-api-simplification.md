# Plugin API Access Pattern Simplification Brainstorm

## Current State Analysis

**Current Pattern Complexity:**
- Requires explicit capability declaration upfront
- Manual status checking before using API
- Nested error handling for each capability check
- Verbose initialization code in every plugin

**Pain Points:**
1. Boilerplate in every plugin (5-10 lines of setup)
2. Status enum-based error handling (not intuitive)
3. Late discovery of missing capabilities (only at init time)
4. Deep nesting of API calls (`api.timeline.selectNotesInWindow()`)
5. No built-in caching or memoization

---

## Simplification Ideas

### Category 1: Auto-Detection & Lazy Loading

#### 1A: Lazy Capability Loading
- **Concept:** Don't declare capabilities upfront; detect on first use
- **Benefit:** Reduce boilerplate, fail fast only where needed
- **Implementation:** Proxy-based API that checks capability per-call
- **Trade-off:** Slightly slower first call per capability

```ts
const api = getPluginHostApi(); // No args needed

// Capability auto-detected on first use
const notes = api.timeline.selectNotesInWindow({...});
// If timeline not available, throws with helpful message
```

#### 1B: Capability Hints (Optional)
- **Concept:** Provide hints for optimization, but don't require them
- **Benefit:** Allows pre-loading/validation without boilerplate
- **Implementation:** Optional second param for perf hints

```ts
const api = getPluginHostApi({
    hints: ['timeline.read', 'audio.features.read']
});
```

---

### Category 2: Error Handling Simplification

#### 2A: Exception-Based Instead of Status Codes
- **Concept:** Throw typed exceptions instead of status enum
- **Benefit:** More conventional error handling, integrates with try/catch
- **Implementation:** Custom error classes

```ts
try {
    const api = getPluginHostApi();
    const notes = api.timeline.selectNotesInWindow({...});
} catch (e) {
    if (e instanceof MissingCapabilityError) {
        return fallback();
    }
    if (e instanceof UnsupportedVersionError) {
        console.error('Plugin host too old');
    }
}
```

#### 2B: Optional Chaining by Default
- **Concept:** API methods return `null` instead of throwing
- **Benefit:** Reduces error handling verbosity
- **Implementation:** Wrapper methods with built-in null coalescing

```ts
const notes = api.timeline?.selectNotesInWindow({...}) ?? [];
const bpm = api.timeline?.getStateSnapshot()?.timeline.globalBpm ?? 120;
```

#### 2C: Unified Error Hook
- **Concept:** Subscribe to API errors once globally
- **Benefit:** Centralized error handling, consistent fallback strategy
- **Implementation:** One setup call in app init

```ts
getPluginHostApi().onError((error, capability) => {
    console.warn(`${capability} unavailable: ${error.message}`);
});
```

---

### Category 3: Namespace & Import Shortcuts

#### 3A: Direct Capability Imports
- **Concept:** Import specific capabilities directly, not through `getPluginHostApi`
- **Benefit:** Clearer dependencies, better tree-shaking, shorter code
- **Implementation:** Export each capability as a separate import

```ts
import { timelineApi, audioApi } from '@mvmnt/plugin-sdk';

// Immediate access, no wrapping call needed
const notes = timelineApi.selectNotesInWindow({...});
```

#### 3B: Aliased Shorthand Methods
- **Concept:** Export common operations as top-level functions
- **Benefit:** Reduce deep nesting, more discoverable
- **Implementation:** Convenience function wrappers

```ts
import { selectNotes, sampleAudio, secondsToBeats } from '@mvmnt/plugin-sdk';

const notes = selectNotes({ trackIds, startSec, endSec });
const rms = sampleAudio({ trackId, feature: 'rms', time });
const beats = secondsToBeats(10.5);
```

#### 3C: Namespace Re-export Shortcuts
- **Concept:** Add shorter aliases to deeply nested paths
- **Benefit:** Less typing, but keeps structure
- **Implementation:** Export `api.timeline` → `api.t`, `api.audio` → `api.a`

```ts
const api = getPluginHostApi();
const notes = api.t.selectNotesInWindow({...}); // instead of api.timeline
```

---

### Category 4: Framework Integration

#### 4A: Vue Composable
- **Concept:** Wrap API in `usePluginHostApi()` hook
- **Benefit:** Reactive updates, simplified setup per component
- **Implementation:** Custom composable

```ts
export default defineComponent({
    setup() {
        const { api, isReady, error } = usePluginHostApi();
        return { api, isReady, error };
    }
});
```

#### 4B: React Hook or Context
- **Concept:** Similar to Vue, but for React
- **Benefit:** Context-based sharing, hook-based usage

```ts
function MyPlugin() {
    const api = usePluginHostApi();
    // ...
}
```

#### 4C: Decorator/Annotation Support
- **Concept:** Mark methods with `@RequireCapability()` decorator
- **Benefit:** Declarative capability requirements, auto-validation
- **Implementation:** TypeScript decorators

```ts
class MyPlugin {
    @RequireCapability('timeline.read')
    selectNotes() { ... }
}
```

---

### Category 5: Caching & Performance

#### 5A: Built-in Query Caching
- **Concept:** Cache `getStateSnapshot()`, `selectNotesInWindow()` results
- **Benefit:** Reduce repeated lookups, faster re-renders
- **Implementation:** Optional cache layer in SDK

```ts
const api = getPluginHostApi({ cache: true });
const notes1 = api.timeline.selectNotesInWindow({...}); // fetches
const notes2 = api.timeline.selectNotesInWindow({...}); // returns cached
```

#### 5B: Memoization Helpers
- **Concept:** Export `memoize()` utility for plugin use
- **Benefit:** Simple way to cache expensive computations
- **Implementation:** Utility function

```ts
const memoizedGetBpm = memoize(
    () => api.timeline.getStateSnapshot()?.timeline.globalBpm ?? 120
);
```

---

### Category 6: Multi-Call Optimization

#### 6A: Batch Query API
- **Concept:** Execute multiple queries in one API call
- **Benefit:** Reduced overhead, atomic operations
- **Implementation:** New `api.batch()` method

```ts
const results = api.batch({
    notes: { action: 'selectNotesInWindow', args: {...} },
    state: { action: 'getStateSnapshot' },
    tracks: { action: 'getTracksByIds', args: {...} }
});
```

#### 6B: Selector/Observer Pattern
- **Concept:** Subscribe to specific state changes instead of polling
- **Benefit:** Event-driven, automatic updates
- **Implementation:** Observer API or RxJS integration

```ts
api.timeline.onStateChange((state) => {
    console.log('Updated:', state);
});
```

---

### Category 7: Type Safety

#### 7A: Stricter TypeScript Inference
- **Concept:** Use TypeScript overloads to infer capability requirements
- **Benefit:** Compile-time capability checking
- **Implementation:** Generic function overloads

```ts
// TypeScript knows this needs 'timeline.read' capability
const api = getPluginHostApi<['timeline.read']>();
```

#### 7B: Capability Typing
- **Concept:** Export capability types explicitly
- **Benefit:** Better autocomplete, IDE support
- **Implementation:** TypeScript `as const` for capabilities

```ts
type RequiredCapabilities = typeof [PLUGIN_CAPABILITIES.timelineRead];
```

---

### Category 8: Graceful Degradation

#### 8A: Fallback-Friendly Responses
- **Concept:** API methods return union types with fallback values
- **Benefit:** Users don't need null checks everywhere
- **Implementation:** Always return safe defaults

```ts
// Always returns array (empty if unavailable)
const notes: TimelineNoteEvent[] = api.timeline?.selectNotesInWindow({...}) ?? [];
// Always returns number (120 is default BPM)
const bpm: number = api.timeline?.getStateSnapshot()?.timeline.globalBpm ?? 120;
```

#### 8B: Capability Availability Check
- **Concept:** Single method to check all capabilities upfront
- **Benefit:** Simpler conditional rendering based on features
- **Implementation:** Method that returns capability map

```ts
const available = api.getAvailableCapabilities();
if (available.timelineRead) {
    // show timeline-dependent UI
}
```

---

### Category 9: Syntax Sugar

#### 9A: Destructuring Support
- **Concept:** Make API destructurable for cleaner imports
- **Benefit:** Familiar pattern for JavaScript developers
- **Implementation:** Ensure all properties are enumerable

```ts
const { timeline, audio, timing, utilities } = getPluginHostApi();
```

#### 9B: Ternary/Nullish Coalescing Idioms
- **Concept:** Document common null-safe access patterns
- **Benefit:** Community learns best practices
- **Implementation:** Guide in docs

```ts
// Pattern 1: Nullish coalescing
const bpm = api.timeline?.getStateSnapshot()?.timeline.globalBpm ?? 120;

// Pattern 2: Optional chaining with arrays
const notes = api.timeline?.selectNotesInWindow({...}) ?? [];
```

---

## Recommended Quick Wins (Low Effort, High Impact)

1. **1B: Capability Hints (Optional)** - Make the capability array optional, fall back to auto-detection
2. **2C: Unified Error Hook** - Centralized error handling
3. **3B: Aliased Shorthand Methods** - Export `selectNotes()`, `sampleAudio()`, etc. directly
4. **8B: Capability Availability Check** - Add `api.getAvailableCapabilities()` method
5. **9A: Destructuring Support** - Ensure API is destructurable

---

## Medium Lift, Significant Impact

1. **2A: Exception-Based Error Handling** - Rewrite error model (breaking change for next major)
2. **3A: Direct Capability Imports** - Allow `import { timelineApi }` (parallel to current approach)
3. **4A/4B: Framework Hooks** - Add Vue composable, React hook
4. **5A: Built-in Query Caching** - Optional cache layer

---

## Future Considerations

- **6B: Observer Pattern** - For real-time data tracking (requires host-side changes)
- **4C: Decorator Support** - Requires TypeScript 5+ decorators
- **7A: Stricter TypeScript** - Leverage conditional types for capability inference
- **5B: Memoization Helpers** - Export utility, document pattern

---

## Summary Table

| Idea | Complexity | Impact | Breaking | Recommendation |
|------|-----------|--------|----------|---|
| 1B: Optional Hints | Low | Medium | No | Quick Win |
| 2A: Exceptions | High | High | Yes | Major Version |
| 2B: Optional Chaining | Low | Medium | No | Quick Win |
| 2C: Error Hook | Medium | Medium | No | Quick Win |
| 3A: Direct Imports | Medium | High | No | v1.2+ |
| 3B: Shortcuts | Low | High | No | Quick Win |
| 3C: Aliases | Low | Low | No | Nice-to-Have |
| 4A/4B: Hooks | Medium | High | No | v1.2+ |
| 4C: Decorators | Medium | Medium | No | v2.0+ |
| 5A: Caching | Medium | Medium | No | v1.2+ |
| 5B: Memoization | Low | Low | No | Docs Pattern |
| 6A: Batch | High | High | No | v1.5+ |
| 6B: Observer | High | High | No | v2.0+ |
| 7A: Stricter TS | Medium | Medium | No | v1.2+ |
| 8B: Availability Check | Low | Medium | No | Quick Win |
| 9A: Destructuring | Low | Low | No | Should Have |

---

## Implementation Roadmap (Prioritized)

### Immediate (v1.0.x patch)
- 1B: Optional Hints
- 2C: Unified Error Hook
- 3B: Shorthand Methods
- 8B: Capability Availability Check

### Short-term (v1.2)
- 2B: Optional Chaining Patterns
- 3A: Direct Capability Imports
- 4A/4B: Framework Hooks
- 9A: Destructuring Support

### Medium-term (v1.5)
- 5A: Query Caching
- 6A: Batch Query API
- 7A: Stricter TypeScript

### Long-term (v2.0)
- 2A: Exception-Based Error Handling (breaking)
- 4C: Decorator Support
- 6B: Observer Pattern

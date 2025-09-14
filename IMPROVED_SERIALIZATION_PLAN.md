# Improved Scene Serialization Plan

## Executive Summary

After reviewing the original plan and examining the current codebase, I've identified several critical issues and architectural improvements needed for a successful serialization overhaul. This document provides a refined, more pragmatic approach.

## Issues with Original Plan

### 1. **Overly Complex Schema Design**

-   **Issue**: The nested versioning system with separate version numbers for each subsection (scene v2, timeline v2, macros v1, etc.) creates unnecessary complexity
-   **Impact**: Multiple migration pipelines, complex validation, maintenance overhead
-   **Solution**: Use a single envelope version with internal compatibility flags

### 2. **Premature Resource Abstraction**

-   **Issue**: The plan introduces a complex resource indexing system before understanding current resource usage patterns
-   **Current Reality**: Resources are simple (font names, image sources), not heavy binary data
-   **Solution**: Start with simple resource references, add abstraction only when needed

### 3. **Unclear Timeline Integration Strategy**

-   **Issue**: Plan doesn't account for the existing robust timeline store system
-   **Current Reality**: Timeline state is managed by `useTimelineStore` with comprehensive track management
-   **Solution**: Serialize timeline store state directly, not minimal stub data

### 4. **Binding Serialization Mismatch**

-   **Issue**: Plan proposes "short form" binding encoding that conflicts with existing detailed binding objects
-   **Current Reality**: Bindings already serialize to full objects with type and metadata
-   **Solution**: Keep existing binding serialization format, optimize later if needed

### 5. **Migration Complexity**

-   **Issue**: Plan proposes complex sequential migration chains
-   **Reality Check**: Most changes will be additive, not breaking
-   **Solution**: Simple version detection with targeted fixes for specific schema changes

### 6. **Missing Practical Implementation Details**

-   **Issue**: Plan lacks concrete steps for incremental adoption
-   **Reality**: Need to work alongside existing system during transition
-   **Solution**: Feature-flagged dual serialization approach

## Revised Architecture

### 1. **Simplified Schema Envelope**

```json
{
    "format": "mvmnt-scene",
    "schemaVersion": 1,
    "metadata": {
        "name": "Scene Name",
        "createdAt": "2024-01-01T00:00:00Z",
        "createdWith": {
            "version": "1.0.0",
            "bindingVersion": "1.0.0"
        }
    },
    "scene": {
        "settings": {
            /* existing sceneSettings format */
        },
        "elements": [
            /* existing element format with bindings */
        ]
    },
    "timeline": {
        "state": {
            /* serialized timeline store state */
        }
    },
    "macros": {
        "data": {
            /* existing macro export format */
        }
    },
    "compatibility": {
        "warnings": [],
        "migratedFrom": null
    }
}
```

### 2. **Timeline Integration Strategy**

Instead of creating new timeline serialization, leverage existing timeline store:

```typescript
// Serialize timeline
timeline: {
  state: {
    timeline: store.timeline,
    tracks: store.tracks,
    tracksOrder: store.tracksOrder,
    transport: store.transport,
    // Omit derived state and caches
  }
}

// Deserialize timeline
store.setState({
  timeline: data.timeline.state.timeline,
  tracks: data.timeline.state.tracks,
  tracksOrder: data.timeline.state.tracksOrder,
  transport: data.timeline.state.transport,
})
```

### 3. **Element Serialization Registry**

Build on existing element serialization:

```typescript
interface ElementSerializationAdapter {
    canSerialize(element: SceneElement): boolean;
    serialize(element: SceneElement): ElementDTO;
    deserialize(dto: ElementDTO): SceneElement;
}

class DefaultElementAdapter implements ElementSerializationAdapter {
    canSerialize(): boolean {
        return true;
    }

    serialize(element: SceneElement): ElementDTO {
        // Use existing getSerializableConfig()
        return element.getSerializableConfig();
    }

    deserialize(dto: ElementDTO): SceneElement {
        // Use existing addElementFromRegistry()
        return sceneBuilder.addElementFromRegistry(dto.type, dto);
    }
}
```

### 4. **Incremental Migration Approach**

Rather than complex migration pipelines:

```typescript
interface MigrationRule {
    detect(data: unknown): boolean;
    migrate(data: unknown): SerializedScene;
}

// Simple rule-based migrations
const legacyDetector: MigrationRule = {
    detect: (data: any) => data.elements && !data.format,
    migrate: (data: any) => ({
        format: 'mvmnt-scene',
        schemaVersion: 1,
        scene: {
            settings: data.sceneSettings || {},
            elements: data.elements,
        },
        timeline: { state: extractTimelineFromLegacy(data) },
        macros: { data: data.macros || {} },
    }),
};
```

## Implementation Strategy

### Phase 1: Foundation (Week 1-2)

1. **Create Persistence Module Structure**

    ```
    src/persistence/
    ├── index.ts
    ├── schema.ts (Zod schemas)
    ├── serializers/
    │   ├── scene-serializer.ts
    │   ├── timeline-serializer.ts
    │   └── element-registry.ts
    ├── migrations/
    │   └── legacy-migration.ts
    └── __tests__/
    ```

2. **Basic Schema Definition**

    ```typescript
    const SceneEnvelopeSchema = z.object({
      format: z.literal('mvmnt-scene'),
      schemaVersion: z.number(),
      metadata: z.object({...}),
      scene: z.object({...}),
      timeline: z.object({...}),
      macros: z.object({...})
    });
    ```

3. **Facade Implementation**
    ```typescript
    export class ScenePersistence {
        export(): SerializedScene {
            /* ... */
        }
        import(data: unknown): ImportResult {
            /* ... */
        }
    }
    ```

### Phase 2: Integration (Week 3)

4. **Feature-Flagged Dual Export**

    ```typescript
    // In scene builder
    serializeScene() {
      const legacy = this.legacySerialize();

      if (ENABLE_NEW_SERIALIZATION) {
        const modern = scenePersistence.export();
        // Validate equivalence during transition
        this.validateEquivalence(legacy, modern);
        return modern;
      }

      return legacy;
    }
    ```

5. **Timeline Store Integration**
    ```typescript
    // Serialize only essential timeline state
    const timelineSerializer = {
        serialize: () => ({
            timeline: store.timeline,
            tracks: Object.fromEntries(Object.entries(store.tracks).filter(([, track]) => track.enabled)),
            tracksOrder: store.tracksOrder,
            transport: {
                isPlaying: store.transport.isPlaying,
                loopEnabled: store.transport.loopEnabled,
                // Skip transient UI state
            },
        }),
    };
    ```

### Phase 3: Migration & Testing (Week 4)

6. **Legacy Migration Support**

    ```typescript
    function detectAndMigrate(data: unknown): SerializedScene {
        // Detect legacy format
        if (isLegacyScene(data)) {
            return migrateLegacyScene(data);
        }

        // Validate modern format
        return SceneEnvelopeSchema.parse(data);
    }
    ```

7. **Comprehensive Testing**
    - Round-trip serialization tests
    - Legacy scene migration tests
    - Timeline integration tests
    - Error handling and validation tests

## Key Improvements Over Original Plan

### 1. **Realistic Complexity Scope**

-   Single schema version instead of nested versioning
-   Leverage existing serialization where possible
-   Add complexity incrementally as needed

### 2. **Timeline Store Integration**

-   Direct serialization of timeline store state
-   No custom timeline serialization format
-   Preserve all track and transport state

### 3. **Practical Migration Path**

-   Simple rule-based migration detection
-   Feature flags for gradual rollout
-   Validation of equivalence during transition

### 4. **Better Error Handling**

-   Clear separation of recoverable vs fatal errors
-   Detailed validation with Zod
-   Graceful degradation for unknown elements

### 5. **Performance Considerations**

-   Serialize only active/enabled tracks
-   Skip transient UI state
-   Lazy migration validation

## Risk Mitigation

### 1. **Backward Compatibility**

-   Maintain legacy export format as fallback
-   Support import of all historical scene formats
-   Clear migration path documentation

### 2. **Data Integrity**

-   Schema validation at import time
-   Round-trip validation during development
-   Checksums for critical data sections

### 3. **Performance**

-   Avoid deep cloning during serialization
-   Stream large payloads if needed
-   Benchmark against legacy performance

## Testing Strategy

### 1. **Unit Tests**

-   Schema validation edge cases
-   Element serialization round-trips
-   Migration rule correctness

### 2. **Integration Tests**

-   Full scene save/load cycles
-   Timeline state preservation
-   Macro binding resolution

### 3. **Regression Tests**

-   Import legacy scenes from production
-   Validate output equivalence
-   Performance benchmarks

## Conclusion

This revised plan provides a more pragmatic, incremental approach to serialization improvements while addressing the core issues identified in the original plan. The focus is on:

1. **Simplicity**: Single schema version, direct store serialization
2. **Compatibility**: Gradual migration with dual-export validation
3. **Practicality**: Leverage existing code, minimize breaking changes
4. **Testability**: Clear validation points and regression coverage

The implementation can begin immediately with Phase 1, providing a solid foundation for the more advanced features proposed in the original plan.

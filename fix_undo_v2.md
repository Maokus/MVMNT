# Fix Undo v2: Comprehensive Phased Implementation Plan

**Goal**: Make element transforms undoable by routing all canvas interactions through the document store's action system. When users drag, scale, rotate, anchor, or reorder scene elements, Cmd/Ctrl+Z should revert changes and Shift+Cmd/Ctrl+Z should redo them.

## Current State Analysis

-   ✅ Document store with undo/redo infrastructure exists (`src/state/document/`)
-   ✅ Action API with `updateSceneElement`, `addSceneElement`, `removeSceneElement` available
-   ✅ Global keyboard shortcuts wired (`src/context/UndoContext.tsx`)
-   ❌ Canvas interactions bypass document store (use runtime `sceneBuilder` only)
-   ❌ History grouping not implemented for drag gestures
-   ❌ Transform throttling not implemented during drags

---

## Phase 1: Foundation - History Grouping Infrastructure

**Objective**: Add grouping capabilities to the document store actions API to support batching multiple operations into single undo units.

### Implementation Tasks

1. **Extend actions.ts with grouping functions**

    - File: `src/state/document/actions.ts`
    - Add `beginHistoryGroup(label?: string)` - proxy to `documentStore.beginGroup`
    - Add `endHistoryGroup()` - proxy to `documentStore.endGroup`
    - Add `updateSceneElements(ids: string[], updater: (el: any) => void, meta?: PatchMeta)` for bulk updates

2. **Add throttling utility for drag operations**

    - File: `src/utils/throttle.ts` (new file)
    - Implement `createThrottledAction` using `requestAnimationFrame`
    - Support cancellation for interrupted drags

3. **Extend document store configuration**
    - Verify history cap is set appropriately (target: 200 entries)
    - Enable history logging if not already active for debugging

### Acceptance Criteria

-   [ ] `beginHistoryGroup('test')` and `endHistoryGroup()` calls create single undo unit
-   [ ] Multiple `updateSceneElement` calls within a group appear as one history entry
-   [ ] `updateSceneElements` can batch update multiple elements in single commit
-   [ ] Throttling utility limits action frequency to ~60fps during continuous updates
-   [ ] History cap prevents memory growth beyond 200 entries
-   [ ] All grouping functions have appropriate TypeScript types and JSDoc

### Testing

```typescript
// Unit tests in src/state/document/__tests__/actions.test.ts
describe('History Grouping', () => {
    test('groups multiple updates into single undo unit', () => {
        beginHistoryGroup('multi-update');
        updateSceneElement('el1', (el) => (el.offsetX = 10));
        updateSceneElement('el2', (el) => (el.offsetY = 20));
        endHistoryGroup();

        undo();
        expect(getElement('el1').offsetX).toBe(0);
        expect(getElement('el2').offsetY).toBe(0);

        redo();
        expect(getElement('el1').offsetX).toBe(10);
        expect(getElement('el2').offsetY).toBe(20);
    });
});
```

---

## Phase 2: Canvas Drag Integration - Move Operations

**Objective**: Make element move/drag operations undoable by mirroring runtime updates through document actions.

### Implementation Tasks

1. **Enhance drag lifecycle tracking**

    - File: `src/ui/panels/preview/canvasInteractionUtils.ts`
    - Modify `startHandleDrag` and `performElementHitTest` to call `beginHistoryGroup('dragElement')`
    - Track drag state to prevent duplicate group creation

2. **Mirror move operations to document store**

    - In `updateMoveDrag` function:
        - Continue existing `sceneBuilder.updateElementConfig` call for immediate feedback
        - Add throttled `updateSceneElement` call mirroring the same changes
        - Use `requestAnimationFrame` throttling to limit document commits to ~60fps

3. **Complete drag operations**

    - Add drag completion detection in pointer event handlers
    - Call `endHistoryGroup()` on mouse up/pointer cancel
    - Handle interrupted drags (escape key, window blur)

4. **Error handling and recovery**
    - Guard against missing element IDs in document store
    - Ensure runtime and document stay synchronized
    - Add fallback if document action fails

### Acceptance Criteria

-   [ ] Dragging an element creates exactly one undo history entry per drag gesture
-   [ ] Cmd/Ctrl+Z after drag restores element to pre-drag position
-   [ ] Shift+Cmd/Ctrl+Z after undo restores dragged position
-   [ ] Multi-element drag (if supported) groups all moves into single undo unit
-   [ ] Long drags are throttled to prevent history spam
-   [ ] Interrupted drags (ESC, blur) properly close history group
-   [ ] Runtime visual feedback remains immediate during drag
-   [ ] Document store element matches runtime element after drag completion

### Testing

```typescript
// Integration tests
describe('Move Operations Undo', () => {
    test('single element drag creates undoable history', async () => {
        const element = await createTestElement({ offsetX: 0, offsetY: 0 });

        // Simulate drag from (0,0) to (100, 50)
        await simulateDrag(element.id, { from: [0, 0], to: [100, 50] });

        expect(getElementPosition(element.id)).toEqual({ x: 100, y: 50 });

        undo();
        expect(getElementPosition(element.id)).toEqual({ x: 0, y: 0 });

        redo();
        expect(getElementPosition(element.id)).toEqual({ x: 100, y: 50 });
    });
});
```

---

## Phase 3: Scale and Rotation Operations

**Objective**: Extend undo support to scale handles and rotation operations using the same grouping pattern.

### Implementation Tasks

1. **Scale operations integration**

    - File: `src/ui/panels/preview/canvasInteractionUtils.ts`
    - Modify `updateScaleDrag` to mirror changes through `updateSceneElement`
    - Throttle scale updates during continuous scaling
    - Handle both uniform and non-uniform scaling

2. **Rotation operations integration**

    - Modify `updateRotateDrag` to use document actions
    - Maintain smooth rotation feedback while throttling commits
    - Support snap-to-angle functionality (shift key behavior)

3. **Anchor point adjustments**

    - Integrate `updateAnchorDrag` with document store
    - Handle complex anchor + offset coordinate changes
    - Ensure anchor changes are grouped with related transform updates

4. **Handle type-specific grouping labels**
    - Use descriptive labels: `'scaleElement'`, `'rotateElement'`, `'adjustAnchor'`
    - Improve undo/redo UI feedback with specific operation names

### Acceptance Criteria

-   [ ] Scale handle drags create single undo entries with label `'scaleElement'`
-   [ ] Rotation drags create single undo entries with label `'rotateElement'`
-   [ ] Anchor adjustments create single undo entries with label `'adjustAnchor'`
-   [ ] Complex multi-property updates (e.g., anchor + offset) are atomic
-   [ ] Shift-constrained operations (uniform scale, snap rotation) are undoable
-   [ ] All transform properties are properly restored on undo
-   [ ] Performance remains smooth during continuous transform operations

### Testing

```typescript
describe('Transform Operations Undo', () => {
    test('scale operation is undoable', async () => {
        const element = await createTestElement({
            elementScaleX: 1,
            elementScaleY: 1,
            offsetX: 0,
            offsetY: 0,
        });

        await simulateScaleDrag(element.id, {
            handle: 'bottomRight',
            delta: [50, 50],
        });

        expect(getElementScale(element.id)).toEqual({ x: 1.5, y: 1.5 });

        undo();
        expect(getElementScale(element.id)).toEqual({ x: 1, y: 1 });
        expect(getElementPosition(element.id)).toEqual({ x: 0, y: 0 });
    });

    test('rotation operation is undoable', async () => {
        const element = await createTestElement({ elementRotation: 0 });

        await simulateRotateDrag(element.id, { angle: 45 });

        expect(getElementRotation(element.id)).toBe(45);

        undo();
        expect(getElementRotation(element.id)).toBe(0);
    });
});
```

---

## Phase 4: Scene Management Operations

**Objective**: Make element ordering, visibility, duplication, and deletion operations undoable.

### Implementation Tasks

1. **Element visibility toggles**

    - File: `src/context/SceneSelectionContext.tsx`
    - Modify `toggleElementVisibility` to use `updateSceneElement` with `visible` property
    - Add appropriate meta labels for undo history

2. **Element reordering (z-index)**

    - Modify `moveElement` to use document actions
    - Group complex reordering operations (when multiple z-indices change)
    - Label as `'reorderElement'`

3. **Element duplication**

    - Modify `duplicateElement` to use `addSceneElement`
    - Ensure duplicated elements have unique IDs
    - Label as `'duplicateElement'`

4. **Element deletion**

    - Modify `deleteElement` to use `removeSceneElement`
    - Handle selection state updates
    - Label as `'deleteElement'`

5. **Element ID updates**
    - Modify `updateElementId` to use document actions
    - Handle ID conflicts and validation
    - Update selection state consistently

### Acceptance Criteria

-   [ ] Toggling element visibility is undoable
-   [ ] Moving elements up/down in layer order is undoable
-   [ ] Complex reordering operations (affecting multiple z-indices) group properly
-   [ ] Element duplication can be undone (removes duplicate)
-   [ ] Element deletion can be undone (restores element and selection)
-   [ ] ID changes are undoable and handle validation errors
-   [ ] All operations maintain proper selection state
-   [ ] Multi-step operations (like duplication) are atomic

### Testing

```typescript
describe('Scene Management Undo', () => {
    test('element visibility toggle is undoable', async () => {
        const element = await createTestElement({ visible: true });

        toggleElementVisibility(element.id);
        expect(getElement(element.id).visible).toBe(false);

        undo();
        expect(getElement(element.id).visible).toBe(true);
    });

    test('element deletion is undoable', async () => {
        const element = await createTestElement();
        const initialCount = getSceneElementCount();

        deleteElement(element.id);
        expect(getSceneElementCount()).toBe(initialCount - 1);
        expect(getElement(element.id)).toBeNull();

        undo();
        expect(getSceneElementCount()).toBe(initialCount);
        expect(getElement(element.id)).toBeDefined();
    });
});
```

---

## Phase 5: Performance and Polish

**Objective**: Optimize performance, add comprehensive error handling, and improve developer experience.

### Implementation Tasks

1. **Advanced throttling and debouncing**

    - Implement smarter throttling that batches multiple property updates
    - Add debouncing for rapid successive operations
    - Optimize memory usage during long drag sessions

2. **Error handling and recovery**

    - Add comprehensive error boundaries around undo operations
    - Implement recovery mechanisms for corrupted history states
    - Add logging and debugging utilities

3. **Developer tooling**

    - Add `setHistoryLogger` integration for debugging
    - Create visual indicators for history group boundaries
    - Add performance monitoring for action frequency

4. **Memory and history management**
    - Implement intelligent history compression for similar operations
    - Add history statistics and monitoring
    - Optimize serialization performance

### Acceptance Criteria

-   [ ] Drag operations never exceed 60 FPS commit rate under heavy load
-   [ ] Memory usage remains stable during extended editing sessions
-   [ ] Error states are recoverable without losing work
-   [ ] Developer tools provide clear visibility into undo history
-   [ ] Performance metrics show no regression in transform responsiveness
-   [ ] History compression reduces memory usage for repetitive operations

### Testing

```typescript
describe('Performance and Reliability', () => {
    test('heavy drag operations maintain performance', async () => {
        const startTime = performance.now();

        for (let i = 0; i < 1000; i++) {
            await simulateMinimalDrag('test-element', { delta: [1, 1] });
        }

        const endTime = performance.now();
        expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
        expect(getHistorySize()).toBeLessThan(100); // Throttling should limit entries
    });

    test('error recovery maintains document consistency', async () => {
        const element = await createTestElement();

        // Simulate error during operation
        const originalUpdateElement = updateSceneElement;
        updateSceneElement = jest.fn().mockImplementation(() => {
            throw new Error('Simulated error');
        });

        await expect(simulateDrag(element.id, { delta: [10, 10] })).rejects.toThrow();

        // Restore function
        updateSceneElement = originalUpdateElement;

        // Document should still be consistent
        expect(getElement(element.id)).toBeDefined();
        expect(canUndo()).toBe(false); // No corrupted history
    });
});
```

---

## Phase 6: Integration and Validation

**Objective**: Comprehensive testing, documentation, and validation of the complete undo system.

### Implementation Tasks

1. **Comprehensive integration testing**

    - End-to-end workflow tests covering all interaction types
    - Cross-platform keyboard shortcut validation
    - Performance benchmarking under realistic usage

2. **Documentation and examples**

    - Update developer docs with new undo architecture
    - Create debugging guides for undo-related issues
    - Document performance characteristics and limitations

3. **Backward compatibility validation**

    - Ensure existing serialization/deserialization works
    - Validate import/export functionality
    - Test session restore and recovery

4. **User experience validation**
    - Verify undo/redo keyboard shortcuts work consistently
    - Test undo behavior with complex multi-element scenes
    - Validate undo history UI elements (if any)

### Acceptance Criteria

-   [ ] All canvas interactions are undoable without exceptions
-   [ ] Keyboard shortcuts work consistently across all platforms
-   [ ] Performance meets or exceeds baseline on complex scenes
-   [ ] Document serialization includes all undo-relevant state
-   [ ] Import/export preserves element transform properties
-   [ ] Error scenarios are gracefully handled with clear feedback
-   [ ] Developer documentation covers new undo architecture
-   [ ] Migration path from current state is zero-breaking-change

### Testing

```typescript
describe('End-to-End Undo Integration', () => {
    test('complex editing workflow with mixed operations', async () => {
        // Create scene with multiple elements
        const elements = await Promise.all([
            createTestElement({ id: 'rect', type: 'rectangle' }),
            createTestElement({ id: 'circle', type: 'circle' }),
            createTestElement({ id: 'text', type: 'text' }),
        ]);

        // Perform complex sequence of operations
        await simulateDrag('rect', { delta: [50, 50] });
        await simulateScale('circle', { factor: 1.5 });
        toggleElementVisibility('text');
        duplicateElement('rect');
        await simulateRotate('rect', { angle: 45 });

        // Verify all operations are individually undoable
        for (let i = 0; i < 5; i++) {
            expect(canUndo()).toBe(true);
            undo();
        }

        // Verify complete restoration
        expect(getElement('rect').offsetX).toBe(0);
        expect(getElement('circle').elementScaleX).toBe(1);
        expect(getElement('text').visible).toBe(true);
        expect(getSceneElementCount()).toBe(3); // No duplicate
        expect(getElement('rect').elementRotation).toBe(0);

        // Verify complete redo
        for (let i = 0; i < 5; i++) {
            expect(canRedo()).toBe(true);
            redo();
        }
    });
});
```

---

## Risk Assessment and Mitigation

### High Risk Items

1. **Performance Impact**: Doubling update frequency (runtime + document)

    - **Mitigation**: Aggressive throttling, batching, and performance monitoring
    - **Fallback**: Feature flag to disable undo for performance-critical scenarios

2. **State Synchronization**: Runtime and document drift

    - **Mitigation**: Comprehensive testing, error detection, and recovery mechanisms
    - **Fallback**: Document store as source of truth with runtime rebuild capability

3. **History Memory Usage**: Large scenes with many operations
    - **Mitigation**: History compression, intelligent truncation, and monitoring
    - **Fallback**: Configurable history limits with user control

### Medium Risk Items

1. **Complex Transform Math**: Anchor/scale/rotation interactions

    - **Mitigation**: Extensive unit testing, property-specific validation
    - **Fallback**: Per-operation type feature flags

2. **Multi-element Operations**: Selection and bulk editing
    - **Mitigation**: Phased rollout, starting with single-element operations
    - **Fallback**: Disable multi-element undo initially

---

## Success Metrics

### Functional Metrics

-   [ ] 100% of canvas interactions are undoable
-   [ ] 100% of element management operations are undoable
-   [ ] Zero user-reported data loss incidents related to undo operations
-   [ ] Undo/redo works consistently across all supported platforms

### Performance Metrics

-   [ ] Transform operations maintain <16ms response time (60 FPS)
-   [ ] Memory usage increases by <20% with undo enabled
-   [ ] History operations complete in <5ms for typical scenes
-   [ ] No observable lag during continuous drag operations

### Developer Experience Metrics

-   [ ] New undo-related bugs <5% of total bug reports
-   [ ] Developer documentation covers all undo scenarios
-   [ ] Unit test coverage >95% for undo-related code
-   [ ] Integration test coverage >90% for user workflows

---

## Implementation Timeline

-   **Phase 1** (Foundation): 3-5 days
-   **Phase 2** (Move Operations): 5-7 days
-   **Phase 3** (Scale/Rotation): 5-7 days
-   **Phase 4** (Scene Management): 3-5 days
-   **Phase 5** (Performance): 5-7 days
-   **Phase 6** (Integration): 7-10 days

**Total Estimated Time**: 28-41 days

**Recommended Approach**: Implement phases sequentially with validation at each step. Each phase should be thoroughly tested and working before proceeding to the next phase.

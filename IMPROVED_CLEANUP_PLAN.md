# Improved Cleanup Action Plan

## Current State Assessment

After analyzing the codebase, I've identified what's been completed and what still needs attention:

### ✅ Already Completed

-   `TimelineService` removal and migration to Zustand store + pure utilities
-   Core timing system migration to tick-domain canonical representation
-   Test suite is mostly stable (31 passed test files, 82 passing tests)

### 🔍 Current Pain Points Identified

1. **Extensive Phase Migration Comments**: 50+ references to "Phase X" in comments that add cognitive overhead
2. **Legacy/Deprecated Markers**: 15+ references to "legacy" and "deprecated" throughout codebase
3. **Domain Separation Issues**:
    - `math/midi/` contains music theory logic mixed with geometric math
    - `mouseToTransforms.ts` contains interaction logic in math folder
4. **Import Warnings**: Zustand deprecated import patterns and React test utils warnings

---

## Risk-Managed Phased Action Plan

### Phase A: Low-Risk Documentation & Comment Cleanup

_Estimated Time: 1-2 hours_
_Risk Level: Minimal (no functional changes)_

#### A1. Remove Phase Migration Comments

**Target**: Remove all "Phase X" references and replace with concise documentation
**Files Affected**: ~15 files
**Action**:

```bash
# Search and replace pattern: "Phase X:" → ""
# Search and replace pattern: "Phase X " → ""
# Manual review of context-specific comments
```

#### A2. Clean Legacy/Deprecated Comments

**Target**: Remove "legacy", "deprecated" markers that reference removed functionality
**Files Affected**: ~10 files
**Actions**:

-   Remove comments referencing "legacy seconds authority"
-   Remove "legacy" prefixes from variable/field descriptions
-   Update comments to use present tense for current state

#### A3. Update Import Warnings

**Target**: Fix deprecated Zustand imports and React test utils
**Files Affected**: All files using `import create from 'zustand'`
**Action**: Replace with `import { create } from 'zustand'`

### Phase B: Domain Reorganization

_Estimated Time: 2-3 hours_
_Risk Level: Medium (file moves, import updates)_

#### B1. Reorganize Math Domains

**Problem**: Music theory mixed with geometric math
**Solution**: Create clear domain boundaries

**Actions**:

1. **If keeping MIDI logic**: Move `src/math/midi/` → `src/core/midi/music-theory/`
2. **Move interaction logic**: `src/math/transforms/mouseToTransforms.ts` → `src/core/interaction/mouse-transforms.ts`
3. **Update all imports** in affected files
4. **Update barrel exports** in `src/math/index.ts` and `src/core/index.ts`

#### B2. Consolidate Export Logic Location

**Problem**: Export logic coupling with rendering unclear
**Solution**: Move export utilities closer to core rendering if heavily coupled

**Actions**:

1. Assess dependencies: `src/export/video-exporter.ts` and `src/export/image-sequence-generator.ts`
2. If heavily coupled to `core/render/`: Move to `src/core/export/`
3. Update imports and barrel exports

### Phase C: Architecture Documentation

_Estimated Time: 1 hour_  
_Risk Level: Minimal (documentation only)_

#### C1. Create Architecture Documentation

**Target**: Document the current clean state and prevent regression
**Actions**:

1. Create `docs/ARCHITECTURE.md` with:
    - Domain boundaries explanation
    - Canonical time domain (ticks) summary
    - Import/export patterns
2. Add `scripts/find-deprecated.sh` script to scan for regression keywords
3. Update `README.md` to remove Phase migration references

### Phase D: Testing & Validation

_Estimated Time: 30 minutes_
_Risk Level: Minimal (validation)_

#### D1. Comprehensive Testing

**Actions**:

1. Run full test suite after each phase: `npm run test`
2. Run build validation: `npm run build`
3. Start dev server validation: `npm run start`
4. Address any broken imports/references

---

## Implementation Order & Risk Mitigation

### Recommended Sequence:

1. **Phase A** (comments/docs) - safest, largest impact on readability
2. **Phase C** (documentation) - establish clean baseline before moves
3. **Phase B** (reorganization) - highest risk, most benefit to architecture
4. **Phase D** (validation) - ensure everything still works

### Risk Mitigation Strategies:

-   **Commit after each sub-phase** for easy rollback
-   **Run tests after each file move/deletion**
-   **Use IDE refactoring tools** for import updates where possible
-   **Keep a backup branch** before starting Phase C

---

## Success Metrics

### Immediate Improvements:

-   **-50+ Phase comment references** → Improved code readability
-   **-15+ legacy/deprecated markers** → Reduced cognitive overhead
-   **-1 unused directory** (`shared/`) → Cleaner project structure
-   **0 deprecated import warnings** → Modern code patterns

### Long-term Benefits:

-   **Clear domain boundaries** → Easier navigation for new contributors
-   **Consistent time domain patterns** → Reduced confusion about tick vs seconds
-   **Comprehensive documentation** → Self-documenting architecture
-   **Regression prevention tools** → Maintains clean state

---

## Optional Follow-up Improvements

### If Additional Time Available:

1. **Extract PPQ Constant**: Replace `480` literals with `CANONICAL_PPQ` constant
2. **Create Time Utility**: Single `ticksToHumanTime(state, tick)` for UI formatting
3. **Add ESLint Rules**: Prevent re-introduction of deprecated patterns
4. **Performance Audit**: Check if removed abstractions improved bundle size

### Next Phase Considerations:

-   **UI Component Modernization**: Update any remaining seconds-first UI patterns
-   **Bundle Size Analysis**: Measure impact of cleanup on final bundle
-   **Developer Experience**: Add more type safety around time domain conversions

---

## Estimated Total Time: 4-6 hours

## Risk Level: Low-to-Medium (with proper sequencing)

## Impact: High (significantly improved maintainability and contributor experience)

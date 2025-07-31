# MIDI Visualizer Migration Guide: JavaScript to React + TypeScript

This document outlines the ongoing migration from a JavaScript-based MIDI visualizer to a modern React + TypeScript application, explains the current project structure, and provides guidance for continuing the migration process.

## Table of Contents
1. [Migration Overview](#migration-overview)
2. [Current Project Structure](#current-project-structure)
3. [Migration Progress](#migration-progress)
4. [Continuing the Migration](#continuing-the-migration)
5. [Key Architectural Decisions](#key-architectural-decisions)
6. [Development Guidelines](#development-guidelines)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)

## Migration Overview

### Why Migrate?
The original JavaScript implementation was a single-page application with complex state management and tightly coupled components. The migration to React + TypeScript provides:

- **Better Component Structure**: Modular, reusable React components
- **Type Safety**: TypeScript provides compile-time error checking
- **Modern Development**: Better debugging, hot reload, and development tools
- **Maintainability**: Clearer separation of concerns and easier testing
- **Scalability**: More structured approach for adding new features

### Migration Strategy
We're following a **hybrid approach**:
1. Keep core visualization logic in JavaScript (for now)
2. Wrap it with React components for UI management
3. Gradually migrate core modules to TypeScript
4. Maintain backward compatibility during transition

## Current Project Structure

```
midi_socialpost_v2/
├── public/                     # Static assets
├── ref/                        # Original JavaScript implementation (reference)
│   ├── src/
│   │   ├── core/              # Core logic (MIDI parsing, timing, etc.)
│   │   ├── ui/                # UI components (vanilla JS)
│   │   └── visualizer/        # Visualization engine
│   └── index.html             # Original single-page app
├── src/                       # New React + TypeScript implementation
│   ├── components/            # React components
│   │   ├── MenuBar.tsx        # Top navigation and controls
│   │   ├── MidiVisualizer.tsx # Main container component
│   │   ├── PreviewPanel.tsx   # Canvas and playback controls
│   │   ├── ProgressOverlay.tsx # Export progress modal
│   │   └── SidePanels.tsx     # Configuration panels
│   ├── core/                  # Core logic (copied from ref, needs migration)
│   ├── types/                 # TypeScript type definitions
│   ├── ui/                    # UI logic (copied from ref, needs migration)
│   ├── visualizer/            # Visualization engine (copied from ref)
│   ├── App.tsx                # Main React app
│   ├── App.css                # Styles
│   └── index.tsx              # React entry point
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── MIGRATION.md               # This document
```

### Key Directories Explained

#### `/src/components/`
React components that form the new UI:
- **MidiVisualizer.tsx**: Main container managing visualizer state
- **PreviewPanel.tsx**: Canvas display and playback controls
- **MenuBar.tsx**: File loading, export, and scene naming
- **SidePanels.tsx**: Configuration and editing panels
- **ProgressOverlay.tsx**: Export progress feedback

#### `/src/core/`
Business logic modules (currently JavaScript, migration target):
- **midi-parser.js**: MIDI file parsing and processing
- **timing-manager.js**: Time synchronization and tempo management
- **manager.js**: Note management and state tracking
- **image-sequence-generator.js**: Export functionality
- **macro-manager.js**: Dynamic configuration system

#### `/src/visualizer/`
Rendering engine (currently JavaScript, migration target):
- **visualizer.js**: Main visualization class
- **modular-renderer.js**: Stateless rendering system
- **scene-element-registry.js**: Component registry for scene elements
- **scene-elements/**: Individual visual components (background, text, piano roll, etc.)
- **render-objects/**: Low-level rendering primitives

#### `/src/ui/`
UI logic (currently JavaScript, migration target):
- **hybrid-scene-builder.js**: Scene composition and management
- **dynamic-config-editor.js**: Dynamic configuration UI
- **scene-editor-ui.js**: Visual scene editing interface

#### `/src/types/`
TypeScript type definitions:
- **index.ts**: Shared type definitions

## Migration Progress

### ✅ Completed
- [x] React project setup with TypeScript
- [x] Basic component structure (MenuBar, PreviewPanel, SidePanels)
- [x] Canvas integration with existing visualizer
- [x] File loading and basic playback controls
- [x] Export progress overlay
- [x] CSS styling migration
- [x] Initial preview rendering (without MIDI data)

### 🚧 In Progress
- [ ] TypeScript migration of core modules
- [ ] Proper TypeScript interfaces for all components
- [ ] State management improvements
- [ ] Error boundary implementation

### 📋 Pending
- [ ] Complete TypeScript migration of `/src/core/`
- [ ] Complete TypeScript migration of `/src/visualizer/`
- [ ] Complete TypeScript migration of `/src/ui/`
- [ ] Comprehensive testing setup
- [ ] Performance optimization
- [ ] Documentation and type definitions
- [ ] Remove `/ref/` directory when migration is complete

## Continuing the Migration

### Step 1: Migrate Core Modules to TypeScript

Start with the most isolated modules first:

#### 1.1 Migrate `midi-parser.js`
```bash
# Rename and convert
mv src/core/midi-parser.js src/core/midi-parser.ts
```

**Key changes needed:**
- Add type definitions for MIDI data structures
- Convert to TypeScript syntax
- Export proper interfaces

#### 1.2 Migrate `timing-manager.js`
```bash
mv src/core/timing-manager.js src/core/timing-manager.ts
```

**Key changes needed:**
- Define interfaces for timing data
- Add type safety for time calculations
- Export timing interfaces

#### 1.3 Migrate remaining core modules
- `manager.js` → `manager.ts`
- `image-sequence-generator.js` → `image-sequence-generator.ts`
- `macro-manager.js` → `macro-manager.ts`

### Step 2: Create Comprehensive Type Definitions

In `src/types/index.ts`, define interfaces for:

```typescript
// Example structure
export interface MIDIEvent {
  type: 'noteOn' | 'noteOff';
  time: number;
  note: number;
  velocity: number;
  channel: number;
  duration?: number;
}

export interface MIDIData {
  events: MIDIEvent[];
  duration: number;
  timingManager?: TimingManager;
  trimmedTicks?: number;
}

export interface VisualizerConfig {
  backgroundColor: string;
  noteHeight: number;
  timeUnit: number;
  // ... other config options
}
```

### Step 3: Migrate Visualizer Components

#### 3.1 Convert scene elements
Each file in `src/visualizer/scene-elements/` should be converted:
- Add TypeScript types
- Define proper interfaces
- Maintain existing functionality

#### 3.2 Convert render objects
Files in `src/visualizer/render-objects/` need:
- Type-safe rendering interfaces
- Canvas 2D context typing
- Performance optimizations

### Step 4: Migrate UI Logic

#### 4.1 Convert scene builder
`src/ui/hybrid-scene-builder.js` → `hybrid-scene-builder.ts`
- Add types for scene elements
- Type-safe scene composition
- Better error handling

#### 4.2 Convert configuration editors
- Dynamic config editor with proper typing
- Scene editor with type safety
- Improved validation

### Step 5: Improve React Integration

#### 5.1 Remove `@ts-ignore` comments
Currently, the main component uses `@ts-ignore` for imports:
```typescript
// @ts-ignore
import { MIDIVisualizer as MIDIVisualizerCore } from '../visualizer/visualizer.js';
```

Replace with proper TypeScript imports once modules are migrated.

#### 5.2 Add proper React patterns
- Custom hooks for visualizer logic
- Context providers for shared state
- Error boundaries for robust error handling

#### 5.3 State management improvements
Consider adding:
- React Query for async operations
- Context API for global state
- useReducer for complex state logic

## Key Architectural Decisions

### 1. Hybrid Architecture
**Decision**: Keep JavaScript modules during transition
**Rationale**: Allows gradual migration without breaking existing functionality
**Trade-off**: Temporary complexity with mixed JS/TS codebase

### 2. Component Structure
**Decision**: Separate container and presentational components
**Example**: `MidiVisualizer` (container) + `PreviewPanel` (presentational)
**Benefit**: Clear separation of concerns, easier testing

### 3. Canvas Integration
**Decision**: Keep existing canvas-based visualization
**Rationale**: Proven performance, complex to rewrite
**Future**: Consider migrating to React-friendly libraries (Three.js, React-Canvas-Draw)

### 4. Type Strategy
**Decision**: Progressive typing with interfaces first
**Approach**: Define interfaces early, implement gradually
**Benefit**: Provides documentation and IDE support during migration

## Development Guidelines

### 1. Code Style
- Use TypeScript strict mode
- Prefer interfaces over types for object shapes
- Use meaningful component and variable names
- Add JSDoc comments for complex functions

### 2. Component Patterns
```typescript
// Preferred component structure
interface ComponentProps {
  // Define all props with types
  data: MIDIData;
  onUpdate: (data: MIDIData) => void;
}

const Component: React.FC<ComponentProps> = ({ data, onUpdate }) => {
  // Component logic
  return <div>{/* JSX */}</div>;
};

export default Component;
```

### 3. Error Handling
- Add error boundaries for canvas operations
- Graceful degradation for failed MIDI loads
- User-friendly error messages

### 4. Performance
- Use React.memo for expensive components
- Optimize canvas rendering loops
- Lazy load heavy dependencies

### 5. Testing Strategy
- Unit tests for core modules
- Integration tests for React components
- E2E tests for critical user flows

## Troubleshooting Common Issues

### 1. Import Errors
**Problem**: `Cannot resolve module` errors
**Solution**: Check file extensions in imports, ensure paths are correct

### 2. Type Errors
**Problem**: TypeScript compilation errors
**Solution**: Add proper type definitions, use `any` temporarily if needed

### 3. Canvas Issues
**Problem**: Canvas not rendering or blank screen
**Solution**: 
- Check canvas ref is properly passed
- Ensure initial render is called
- Verify canvas dimensions are reasonable

### 4. Performance Issues
**Problem**: Slow rendering or high memory usage
**Solution**:
- Reduce canvas resolution for preview
- Optimize animation loops
- Use requestAnimationFrame properly

### 5. Build Errors
**Problem**: React Scripts build failures
**Solution**:
- Check all imports use proper extensions
- Ensure TypeScript config is correct
- Remove unused dependencies

## Next Steps Priorities

1. **Immediate** (Next 1-2 weeks):
   - Migrate `midi-parser.js` to TypeScript
   - Create comprehensive type definitions
   - Fix all `@ts-ignore` imports

2. **Short-term** (Next month):
   - Migrate remaining core modules
   - Add error boundaries
   - Improve performance optimization

3. **Medium-term** (Next 2-3 months):
   - Complete visualizer migration
   - Add comprehensive testing
   - Performance profiling and optimization

4. **Long-term** (Next quarter):
   - Remove reference implementation
   - Documentation cleanup
   - Consider architectural improvements

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [Canvas API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) (for future audio features)

---

**Note**: This migration guide should be updated as progress is made. Keep track of completed tasks and update the status sections accordingly.

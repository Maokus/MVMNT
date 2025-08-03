# Anchor Point Rotation Fix - Solution Summary

## Problem Identified

When changing the anchor point of a scene element, the container was being translated correctly to account for the new anchor position, but **rotation was still happening around the container's origin (0,0) rather than around the anchor point relative to the child objects**.

### Root Cause

The issue was in how Canvas 2D transforms were being applied in the `EmptyRenderObject`:

```javascript
// OLD (broken) transform sequence:
ctx.translate(this.x, this.y);  // Move to container position
ctx.rotate(this.rotation);      // Rotate around (0,0) in container space
ctx.scale(this.scaleX, this.scaleY);
// Children render at their original positions
```

This meant that when the anchor point changed:
1. ✅ Container position was correctly adjusted (`offsetX - anchorPixelX`, `offsetY - anchorPixelY`)
2. ❌ But rotation still happened around the container's local origin, not the anchor point

## Solution Implemented

### 1. Enhanced EmptyRenderObject (`src/visualizer/render-objects/empty.js`)

Added anchor-aware transform sequence:

```javascript
// NEW (fixed) transform sequence:
ctx.translate(this.x, this.y);                    // Move to container position
ctx.translate(this.anchorOffsetX, this.anchorOffsetY);  // Move to anchor point
ctx.rotate(this.rotation);                        // Rotate around anchor
ctx.scale(this.scaleX, this.scaleY);             // Scale around anchor
ctx.translate(-this.anchorOffsetX, -this.anchorOffsetY); // Move back from anchor
// Children render at their original positions
```

**Key additions:**
- `setAnchorOffset(anchorOffsetX, anchorOffsetY)` method to store anchor information
- Overridden `render()` method with proper anchor-based transform sequence
- Updated `getBounds()` calculation to account for anchor-based transforms

### 2. Updated SceneElement Base Class (`src/visualizer/scene-elements/base.ts`)

Modified the container creation to pass anchor offset information:

```typescript
// Calculate anchor point in pixel coordinates
const anchorPixelX = bounds.x + bounds.width * this.anchorX;
const anchorPixelY = bounds.y + bounds.height * this.anchorY;

// Create container at adjusted position
const containerObject = new EmptyRenderObject(
    this.offsetX - anchorPixelX,  // Container position accounts for anchor
    this.offsetY - anchorPixelY,
    this.globalScaleX,
    this.globalScaleY,
    this.globalOpacity
);

// Pass anchor offset for proper rotation center
containerObject.setAnchorOffset(anchorPixelX, anchorPixelY);
```

## How It Works Now

### Transform Coordinate System

1. **Container Position**: `(offsetX - anchorPixelX, offsetY - anchorPixelY)`
   - Positions the container so the anchor point lands at the desired offset location

2. **Anchor Offset**: `(anchorPixelX, anchorPixelY)` relative to container
   - Tells the container where the rotation/scaling center should be

3. **Transform Sequence**:
   - Translate to container position
   - Translate to anchor point within container
   - Apply rotation/scaling around anchor
   - Translate back from anchor
   - Render children at their original relative positions

### Result

- ✅ Changing anchor point no longer causes "jumping" during rotation
- ✅ Rotation happens around the correct point relative to the render objects
- ✅ All transforms (rotation, scaling, skewing) now respect the anchor point
- ✅ Child objects maintain their relative positions within the scene element

## Testing the Fix

### 1. Visual Test

Use the debug element with anchor point visualization:

```typescript
// In debug element - shows yellow cross lines and marker at anchor point
debugElement.setTestAnchor(0.0, 0.0);  // Top-left
debugElement.setTestAnchor(0.5, 0.5);  // Center  
debugElement.setTestAnchor(1.0, 1.0);  // Bottom-right

// Apply rotation to see it happen around the anchor
debugElement.setDebugTransforms(45);   // 45 degree rotation
```

### 2. Programmatic Test

The test script `test-anchor-rotation.js` validates the mathematical correctness of the transform system.

## Files Modified

1. **`src/visualizer/render-objects/empty.js`**
   - Added `setAnchorOffset()` method
   - Overrode `render()` method with anchor-aware transforms
   - Updated `getBounds()` calculation

2. **`src/visualizer/scene-elements/base.ts`**
   - Added anchor offset passing to container object

3. **`src/visualizer/scene-elements/debug.ts`**
   - Enhanced with anchor point visualization
   - Added test methods for anchor point changes

## Verification

Run these commands to verify the fix:

```bash
# Check compilation
npx tsc --noEmit

# Run anchor point test
node test-anchor-rotation.js

# Test in browser
npm start
```

The anchor point rotation issue should now be completely resolved!

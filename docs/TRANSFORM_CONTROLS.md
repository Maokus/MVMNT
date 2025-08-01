# Transform and Visibility Controls

This document explains the new transform and visibility controls available for all scene elements in the MIDI visualizer.

## Overview

All scene elements now inherit powerful transform and visibility controls from the base `SceneElement` class. These controls allow you to manipulate the position, scale, rotation, and opacity of any scene element without modifying element-specific properties.

## Available Controls

### Global Transform Properties

#### Position Offset
- `offsetX`: Horizontal position offset (default: 0)
- `offsetY`: Vertical position offset (default: 0)

These properties add to the element's existing position. For example, if a text element is positioned at (100, 50) and you set `offsetX: 20`, the final position will be (120, 50).

#### Scaling
- `globalScaleX`: Horizontal scaling factor (default: 1)
- `globalScaleY`: Vertical scaling factor (default: 1)

These properties multiply with any existing scale values. A value of 1 means no scaling, 0.5 means half size, 2 means double size.

#### Rotation
- `globalRotation`: Rotation angle in degrees (default: 0)

This property adds to any existing rotation. The rotation is applied around the element's center point.

### Global Visibility Properties

#### Opacity
- `globalOpacity`: Transparency level from 0 to 1 (default: 1)

This property multiplies with any existing opacity values. 0 means completely transparent, 1 means completely opaque.

#### Visibility
- `visible`: Boolean to show/hide the element (default: true)
- `zIndex`: Layer ordering (default: 0)

These properties control whether the element is rendered and in what order.

## Configuration Schema

All these properties are automatically exposed in the configuration UI with the following controls:

```javascript
{
  // Position controls
  offsetX: { type: 'number', min: -1000, max: 1000, step: 1 },
  offsetY: { type: 'number', min: -1000, max: 1000, step: 1 },
  
  // Scale controls
  globalScaleX: { type: 'number', min: 0.01, max: 5, step: 0.01 },
  globalScaleY: { type: 'number', min: 0.01, max: 5, step: 0.01 },
  
  // Rotation control
  globalRotation: { type: 'number', min: -360, max: 360, step: 1 },
  
  // Opacity control
  globalOpacity: { type: 'number', min: 0, max: 1, step: 0.01 },
  
  // Visibility controls
  visible: { type: 'boolean' },
  zIndex: { type: 'number', min: 0, max: 100, step: 1 }
}
```

## Programmatic Usage

### Setting Properties Directly

```javascript
// Create a text overlay element
const textElement = new TextOverlayElement('myText');

// Apply global transforms
textElement
  .setOffset(50, 100)           // Move right 50px, down 100px
  .setGlobalScale(1.5)          // Scale to 150%
  .setGlobalRotation(45)        // Rotate 45 degrees
  .setGlobalOpacity(0.8)        // Make 80% opaque
  .setZIndex(10);               // Place on layer 10
```

### Using Configuration Objects

```javascript
const config = {
  offsetX: 50,
  offsetY: 100,
  globalScaleX: 1.5,
  globalScaleY: 1.5,
  globalRotation: 45,
  globalOpacity: 0.8,
  zIndex: 10
};

const textElement = new TextOverlayElement('myText', 'center', config);
```

### Updating at Runtime

```javascript
// Update configuration
textElement.updateConfig({
  offsetX: 100,
  globalRotation: 90
});

// Or use setter methods
textElement.setOffset(100, 200)
           .setGlobalRotation(90);
```

## How It Works

### Transform Application Order

When render objects are created, transforms are applied in this order:

1. Element-specific positioning (e.g., text position, image position)
2. Element-specific scaling and rotation
3. **Global offset** (offsetX, offsetY)
4. **Global scaling** (globalScaleX, globalScaleY)
5. **Global rotation** (globalRotation)
6. **Global opacity** (globalOpacity)
7. **Visibility** (visible)

### Implementation Details

The base `SceneElement` class provides the `applyTransformsToRenderObjects()` method that all child classes should call:

```javascript
buildRenderObjects(config, targetTime) {
  // Create render objects using element-specific logic
  const renderObjects = [/* ... */];
  
  // Apply global transforms and visibility
  return this.applyTransformsToRenderObjects(renderObjects);
}
```

This ensures consistent behavior across all scene element types.

## Examples

### Animated Text Overlay

```javascript
// Create a text element with initial transforms
const animatedText = new TextOverlayElement('title', 'center', {
  text: 'MIDI Visualizer',
  fontSize: 48,
  offsetY: -100,        // Start above screen
  globalOpacity: 0      // Start invisible
});

// Animate entrance over time
function animateEntrance(progress) {
  animatedText.updateConfig({
    offsetY: -100 + (progress * 150),    // Slide down
    globalOpacity: progress,             // Fade in
    globalRotation: (1 - progress) * 180 // Rotate from 180° to 0°
  });
}
```

### Layered Background Effects

```javascript
// Create multiple background layers
const bgLayer1 = new BackgroundElement('bg1', {
  backgroundColor: '#1a1a1a',
  zIndex: 0
});

const bgLayer2 = new ImageElement('bg2', 0, 0, 800, 600, 'texture.png', {
  globalOpacity: 0.3,
  zIndex: 1
});

const bgLayer3 = new ImageElement('bg3', 400, 300, 200, 200, 'logo.png', {
  offsetX: -100,
  offsetY: -100,
  globalOpacity: 0.1,
  globalRotation: 45,
  zIndex: 2
});
```

### Responsive Scaling

```javascript
// Scale elements based on canvas size
function updateForCanvasSize(width, height) {
  const baseWidth = 800;
  const scale = width / baseWidth;
  
  elements.forEach(element => {
    element.setGlobalScale(scale);
  });
}
```

## Best Practices

1. **Use global transforms for layout adjustments** - Keep element-specific properties for the core functionality and use global transforms for positioning and visual effects.

2. **Layer with zIndex** - Use zIndex to control rendering order rather than relying on element creation order.

3. **Combine transforms thoughtfully** - Remember that global transforms multiply with element-specific ones.

4. **Test with different scales** - Ensure your visualizations work well at different global scale values.

5. **Use opacity for transitions** - Global opacity is perfect for fade in/out effects.

## Migration Guide

If you have existing scene elements that need to support the new transform system:

1. Ensure your `buildRenderObjects` method calls `this.applyTransformsToRenderObjects(renderObjects)` before returning
2. Consider which properties should be element-specific vs. global
3. Update any hardcoded positioning to work well with global offsets
4. Test that existing configurations still work as expected

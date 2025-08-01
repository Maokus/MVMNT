// Test example for the new transform system
// This demonstrates how the new affine transform system works

import { SceneElement } from '../src/visualizer/scene-elements/base.js';
import { Rectangle, Text, Line } from '../src/visualizer/render-objects/index.js';

// Create a custom test scene element that demonstrates the new transform system
class TransformTestElement extends SceneElement {
    constructor(id = 'transform-test', config = {}) {
        super('transform-test', id, config);
    }

    _buildRenderObjects(config, targetTime) {
        const renderObjects = [];
        const { canvas } = config;
        const { width, height } = canvas;

        // Create a main rectangle
        const mainRect = new Rectangle(
            width * 0.3,
            height * 0.3,
            width * 0.4,
            height * 0.3,
            'rgba(100, 150, 255, 0.8)'
        );
        renderObjects.push(mainRect);

        // Create some text
        const titleText = new Text(
            width * 0.5,
            height * 0.25,
            'Transform Test',
            'bold 24px Arial',
            '#FFFFFF',
            'center',
            'middle'
        );
        renderObjects.push(titleText);

        // Create a line
        const line = new Line(
            width * 0.2,
            height * 0.7,
            width * 0.8,
            height * 0.7,
            '#FF0000',
            3
        );
        renderObjects.push(line);

        // Individual render objects can have their own transforms
        mainRect.setRotation(Math.PI / 12); // 15 degrees
        mainRect.setScale(1.1, 0.9);
        mainRect.setSkew(Math.PI / 36, 0); // 5 degrees skew

        titleText.setOpacity(0.9);

        return renderObjects;
    }

    static getConfigSchema() {
        const baseSchema = super.getConfigSchema();

        return {
            ...baseSchema,
            name: 'Transform Test Element',
            description: 'Test element for the new transform system',
            category: 'test'
        };
    }
}

// Example usage function
function createTransformExample() {
    // Create element
    const element = new TransformTestElement('test-1');

    // Apply scene-level transforms (these will affect all render objects)
    element.setGlobalScale(1.2, 1.1);        // Scale everything 120% horizontally, 110% vertically
    element.setGlobalRotation(5);             // Rotate everything 5 degrees
    element.setGlobalSkew(2, 1);              // Apply skew
    element.setOffset(20, -10);               // Move everything 20px right, 10px up
    element.setGlobalOpacity(0.95);           // Make everything slightly transparent

    return element;
}

// Example of dynamic transform updates
function animateTransforms(element, time) {
    // Animate the global transforms over time
    const scale = 1 + Math.sin(time * 0.001) * 0.2; // Pulsing scale
    const rotation = time * 0.01; // Continuous rotation
    const skewX = Math.sin(time * 0.002) * 5; // Oscillating skew

    element.setGlobalScale(scale);
    element.setGlobalRotation(rotation);
    element.setGlobalSkewX(skewX);
}

export {
    TransformTestElement,
    createTransformExample,
    animateTransforms
};

/*
Key improvements in the new system:

1. **Simplified Render Objects**: Each render object only handles one set of transform properties:
   - position (x, y)
   - scale (scaleX, scaleY) 
   - rotation
   - skew (skewX, skewY) - NEW!
   - opacity
   - visibility

2. **Scene-Level Transform Processing**: The SceneElement base class now:
   - Builds render objects from subclasses first
   - Calculates a common anchor point (center of all objects)
   - Applies scene transforms by modifying each render object's individual transforms
   - Uses proper affine transform mathematics for composition

3. **No More Dual Transform Systems**: 
   - Removed global* properties from render objects
   - Removed anchor point complexity
   - All transforms are now applied consistently through one system

4. **Better Transform Composition**:
   - Scene transforms are applied in correct order: scale, rotate, translate
   - Individual object transforms and scene transforms compose properly
   - Added skew support for more sophisticated effects

5. **Cleaner Architecture**:
   - Scene elements focus on transform logic
   - Render objects focus on drawing logic
   - Clear separation of concerns
*/

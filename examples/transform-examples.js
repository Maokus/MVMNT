// Example: Using Transform and Visibility Controls
// This file demonstrates how to use the new global transform and visibility controls

import { TextOverlayElement } from '../src/visualizer/scene-elements/text-overlay';
import { ImageElement } from '../src/visualizer/scene-elements/image';
import { BackgroundElement } from '../src/visualizer/scene-elements/background';

// Example 1: Basic Transform Application
function createBasicTransformedElements() {
    // Create a title text with transforms
    const title = new TextOverlayElement('title', 'center', {
        text: 'MIDI Visualizer',
        fontSize: 48,
        x: 400,
        y: 100,
        // Global transforms
        offsetX: 0,
        offsetY: -50,          // Move up by 50 pixels
        globalScaleX: 1.2,     // Scale horizontally by 120%
        globalScaleY: 1.2,     // Scale vertically by 120%
        globalRotation: 5,     // Rotate 5 degrees
        globalOpacity: 0.9,    // 90% opacity
        zIndex: 10
    });

    // Create a subtitle with different transforms
    const subtitle = new TextOverlayElement('subtitle', 'center', {
        text: 'Now with Transform Controls',
        fontSize: 24,
        x: 400,
        y: 150,
        // Global transforms
        offsetY: 20,           // Move down by 20 pixels
        globalScaleX: 0.8,     // Scale to 80%
        globalOpacity: 0.7,    // 70% opacity
        zIndex: 9
    });

    return { title, subtitle };
}

// Example 2: Layered Background with Transforms
function createLayeredBackground() {
    // Main background
    const mainBg = new BackgroundElement('mainBg', {
        backgroundColor: '#1a1a2e',
        zIndex: 0
    });

    // Semi-transparent overlay pattern
    const pattern = new ImageElement('pattern', 0, 0, 800, 600, 'pattern.png', {
        globalOpacity: 0.1,    // Very subtle
        globalScaleX: 2,       // Scale pattern larger
        globalScaleY: 2,
        zIndex: 1
    });

    // Animated logo in corner
    const logo = new ImageElement('logo', 50, 50, 100, 100, 'logo.png', {
        globalOpacity: 0.3,
        globalRotation: 0,     // Will be animated
        zIndex: 5
    });

    return { mainBg, pattern, logo };
}

// Example 3: Animation Functions
function createAnimationCallbacks() {
    const elements = createBasicTransformedElements();

    // Animate title entrance
    function animateTitleEntrance(progress) {
        // progress goes from 0 to 1
        elements.title.updateConfig({
            offsetY: -50 - (100 * (1 - progress)), // Start higher, move down
            globalOpacity: progress,                 // Fade in
            globalRotation: 45 * (1 - progress)     // Rotate from 45° to 5°
        });
    }

    // Animate subtitle slide in
    function animateSubtitleSlide(progress) {
        elements.subtitle.updateConfig({
            offsetX: 300 * (1 - progress),  // Slide in from right
            globalOpacity: progress * 0.7   // Fade in to 70%
        });
    }

    // Pulsing animation
    function animatePulse(time) {
        const pulse = 1 + 0.1 * Math.sin(time * 0.005); // 0.9 to 1.1 scale
        elements.title.updateConfig({
            globalScaleX: 1.2 * pulse,
            globalScaleY: 1.2 * pulse
        });
    }

    return {
        animateTitleEntrance,
        animateSubtitleSlide,
        animatePulse
    };
}

// Example 4: Responsive Layout
function createResponsiveLayout(canvasWidth, canvasHeight) {
    const baseWidth = 800;
    const baseHeight = 600;

    // Calculate scale factors
    const scaleX = canvasWidth / baseWidth;
    const scaleY = canvasHeight / baseHeight;
    const uniformScale = Math.min(scaleX, scaleY);

    // Create elements with responsive transforms
    const title = new TextOverlayElement('responsiveTitle', 'center', {
        text: 'Responsive Title',
        fontSize: 48,
        x: baseWidth / 2,
        y: 100,
        // Apply uniform scaling to maintain aspect ratio
        globalScaleX: uniformScale,
        globalScaleY: uniformScale,
        // Center the scaled content
        offsetX: (canvasWidth - baseWidth * uniformScale) / 2,
        offsetY: (canvasHeight - baseHeight * uniformScale) / 2
    });

    return { title, scaleX, scaleY, uniformScale };
}

// Example 5: Dynamic Transform Updates
function createDynamicTransforms() {
    const elements = createBasicTransformedElements();

    // Function to update transforms based on user input or time
    function updateTransforms(options = {}) {
        const {
            offsetX = 0,
            offsetY = 0,
            scale = 1,
            rotation = 0,
            opacity = 1
        } = options;

        // Update all elements with new transforms
        Object.values(elements).forEach(element => {
            element.updateConfig({
                offsetX: offsetX,
                offsetY: offsetY,
                globalScaleX: scale,
                globalScaleY: scale,
                globalRotation: rotation,
                globalOpacity: opacity
            });
        });
    }

    // Preset transform configurations
    const presets = {
        normal: { scale: 1, rotation: 0, opacity: 1 },
        large: { scale: 1.5, rotation: 0, opacity: 1 },
        rotated: { scale: 1, rotation: 45, opacity: 1 },
        faded: { scale: 1, rotation: 0, opacity: 0.5 },
        dramatic: { scale: 1.8, rotation: 15, opacity: 0.8, offsetY: -50 }
    };

    function applyPreset(presetName) {
        if (presets[presetName]) {
            updateTransforms(presets[presetName]);
        }
    }

    return { elements, updateTransforms, applyPreset, presets };
}

// Example 6: Scene Composition with Z-Index
function createComposedScene() {
    // Background layers (zIndex 0-10)
    const background = new BackgroundElement('bg', {
        backgroundColor: '#0a0a0a',
        zIndex: 0
    });

    const backgroundTexture = new ImageElement('bgTexture', 0, 0, 800, 600, 'texture.jpg', {
        globalOpacity: 0.2,
        zIndex: 1
    });

    // Main content (zIndex 10-50)
    const mainTitle = new TextOverlayElement('mainTitle', 'center', {
        text: 'Main Title',
        fontSize: 64,
        x: 400,
        y: 200,
        globalScaleX: 1.2,
        zIndex: 20
    });

    const subtitle = new TextOverlayElement('subtitle', 'center', {
        text: 'Subtitle Text',
        fontSize: 32,
        x: 400,
        y: 280,
        globalOpacity: 0.8,
        zIndex: 19
    });

    // Overlay effects (zIndex 50+)
    const overlay = new ImageElement('overlay', 0, 0, 800, 600, 'overlay.png', {
        globalOpacity: 0.3,
        zIndex: 50
    });

    const topText = new TextOverlayElement('topText', 'right', {
        text: 'Always on Top',
        fontSize: 16,
        x: 750,
        y: 30,
        globalOpacity: 0.9,
        zIndex: 100
    });

    return {
        background,
        backgroundTexture,
        mainTitle,
        subtitle,
        overlay,
        topText
    };
}

// Export for use in other files
export {
    createBasicTransformedElements,
    createLayeredBackground,
    createAnimationCallbacks,
    createResponsiveLayout,
    createDynamicTransforms,
    createComposedScene
};

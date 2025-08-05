// Main MIDI Visualizer class
import { ModularRenderer } from './modular-renderer.js';
import { HybridSceneBuilder } from './hybrid-scene-builder.js';
import { sceneElementRegistry } from './scene-element-registry.js';
import { globalMacroManager } from './macro-manager.ts';
import { BoundHybridSceneBuilder } from './bound-hybrid-scene-builder.js';

export class MIDIVisualizerCore {
    constructor(canvas, timingManager = null) {
        if (!canvas) {
            throw new Error('Canvas element is required');
        }

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        if (!this.ctx) {
            throw new Error('Could not get 2D context from canvas');
        }

        this.events = [];
        this.duration = 0;
        this.isPlaying = false;
        this.startTime = 0;
        this.animationId = null;
        this.currentTime = -0.5; // Start with buffer time so first notes can animate in

        // Export settings for frame stepping and export functionality
        this.exportSettings = {
            fps: 30,
            resolution: 1500,
            fullDuration: true
        };

        // Debug settings
        this.debugSettings = {
            showAnchorPoints: false
        };

        // Render invalidation system
        this._needsRender = true;
        this._lastRenderTime = -1;

        // Note rendering system - using modular approach with RenderObjects
        // Main rendering system - stateless renderer for all drawing operations
        this.modularRenderer = new ModularRenderer(); // New modular renderer
        this.sceneBuilder = new BoundHybridSceneBuilder(); // Scene builder for creating RenderObjects

        this._setupImageLoadedListener();

        // Initialize the default scene
        this.sceneBuilder.createDefaultMIDIScene(this.timingManager);
    }

    updateSceneElementTimingManager() {
        // The most reliable way to update timing manager references is to recreate the scene
        // This ensures all elements get the correct timing manager reference
        this.sceneBuilder.createDefaultMIDIScene(this.timingManager);
    }

    play() {
        // Check if we have global events OR if any scene elements have their own MIDI data
        const hasGlobalEvents = this.events.length > 0;
        const hasElementEvents = this.getCurrentDuration() > 0;

        console.log('MIDIVisualizerCore.play() called:', {
            hasGlobalEvents,
            globalEventCount: this.events.length,
            hasElementEvents,
            elementDuration: this.getCurrentDuration()
        });

        if (!hasGlobalEvents && !hasElementEvents) {
            console.log('No MIDI data available to play (neither global nor element-specific)');
            return;
        }

        this.isPlaying = true;
        // Add a small buffer time (0.5 seconds) before the actual MIDI content starts
        // This allows the first notes to have their onset animations
        const bufferTime = 0.5; // seconds
        this.startTime = performance.now() - ((this.currentTime - bufferTime) * 1000);
        this.animate();
    }

    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    stop() {
        // First ensure we're no longer playing
        this.isPlaying = false;

        // Make sure to cancel any pending animation frames
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Reset time position
        this.currentTime = -0.5; // Start at buffer time so first notes can animate in
        this.startTime = 0; // Reset start time to prevent miscalculations

        // Note: noteManager functionality is now handled by scene elements

        // Redraw with new state
        this.invalidateRender();
    }

    seek(time) {
        const bufferTime = 0.5; // Same buffer as in other methods
        const currentDuration = this.getCurrentDuration();
        this.currentTime = Math.max(-bufferTime, Math.min(time, currentDuration + bufferTime));

        // Note: Note manager functionality is now handled by scene elements

        // If playing, update start time to maintain correct playback position
        if (this.isPlaying) {
            this.startTime = performance.now() - ((this.currentTime + 0.5) * 1000);
        }

        // Note: Active notes updates are now handled by scene elements
        this.invalidateRender();
    }

    getCurrentDuration() {
        // Get maximum duration from all elements with timing managers
        const maxDuration = this.sceneBuilder.getMaxDuration();

        // If we have elements with their own durations, use that, otherwise fallback to loaded MIDI duration
        return maxDuration > 0 ? maxDuration : this.duration;
    }

    /**
     * Load MIDI data into the visualizer
     * @param {Object} midiData - Parsed MIDI data from MIDIParser
     */
    loadMIDIData(midiData) {
        console.log('MIDIVisualizerCore.loadMIDIData called with:', {
            eventCount: midiData.events?.length || 0,
            duration: midiData.duration,
            tempo: midiData.tempo,
            fileName: midiData.fileName || 'Unknown'
        });

        // Store MIDI data globally for compatibility
        this.events = midiData.events || [];
        this.duration = midiData.duration || 0;

        // Update the MIDI file macro
        if (midiData.fileName) {
            const mockFile = new File([], midiData.fileName, { type: 'audio/midi' });
            globalMacroManager.updateMacroValue('midiFile', mockFile);
        }

        // Convert MIDI events to notes format
        const notes = this._convertMidiEventsToNotes(midiData.events);

        // Load MIDI data into all TimeUnitPianoRoll elements
        const pianoRollElements = this.sceneBuilder.getElementsByType('timeUnitPianoRoll');
        for (const element of pianoRollElements) {
            if (element.timingManager && element.timingManager.loadMIDIData) {
                element.timingManager.loadMIDIData(midiData, notes, true); // Reset macro values on new load
                console.log(`Loaded MIDI data into piano roll element '${element.id}'`);
            }
        }

        // Force re-render to show the new data
        this.invalidateRender();

        console.log(`MIDI data loaded: ${notes.length} notes, duration: ${midiData.duration}s`);
    }

    /**
     * Convert MIDI events to note format (helper method)
     * @param {Array} midiEvents - Array of MIDI events
     * @returns {Array} Array of note objects
     * @private
     */
    _convertMidiEventsToNotes(midiEvents) {
        if (!midiEvents || !Array.isArray(midiEvents)) {
            return [];
        }

        const notes = [];
        const noteOnEvents = new Map(); // Track note on events to pair with note off

        for (const event of midiEvents) {
            if (event.type === 'noteOn' && event.velocity > 0) {
                // Store note on event
                const key = `${event.note}_${event.channel || 0}`;
                noteOnEvents.set(key, event);
            } else if ((event.type === 'noteOff') || (event.type === 'noteOn' && event.velocity === 0)) {
                // Find matching note on event
                const key = `${event.note}_${event.channel || 0}`;
                const noteOnEvent = noteOnEvents.get(key);

                if (noteOnEvent) {
                    // Create note object
                    const note = {
                        note: event.note,
                        velocity: noteOnEvent.velocity,
                        startTime: noteOnEvent.time,
                        endTime: event.time,
                        duration: event.time - noteOnEvent.time,
                        channel: event.channel || 0
                    };
                    notes.push(note);
                    noteOnEvents.delete(key);
                }
            }
        }

        // Handle any remaining note on events (notes that don't have corresponding note off)
        for (const [, noteOnEvent] of noteOnEvents) {
            const note = {
                note: noteOnEvent.note,
                velocity: noteOnEvent.velocity,
                startTime: noteOnEvent.time,
                endTime: noteOnEvent.time + 1.0, // Default 1 second duration
                duration: 1.0,
                channel: noteOnEvent.channel || 0
            };
            notes.push(note);
        }

        // Sort notes by start time
        notes.sort((a, b) => a.startTime - b.startTime);

        return notes;
    }

    /**
     * Update export settings that affect frame stepping and export functionality
     * @param {Object} settings - Export settings object
     * @param {number} settings.fps - Frame rate for stepping and export
     * @param {number} settings.resolution - Resolution for export
     * @param {boolean} settings.fullDuration - Whether to export full duration
     */
    updateExportSettings(settings) {
        this.exportSettings = { ...this.exportSettings, ...settings };
    }

    /**
     * Get current export settings
     * @returns {Object} Current export settings
     */
    getExportSettings() {
        return { ...this.exportSettings };
    }

    /**
     * Update debug settings that affect visualization behavior
     * @param {Object} settings - Debug settings object
     * @param {boolean} settings.showAnchorPoints - Whether to show anchor point visualization
     */
    updateDebugSettings(settings) {
        this.debugSettings = { ...this.debugSettings, ...settings };
        this.invalidateRender(); // Re-render with new debug settings
    }

    /**
     * Get current debug settings
     * @returns {Object} Current debug settings
     */
    getDebugSettings() {
        return { ...this.debugSettings };
    }

    stepForward() {
        const frameRate = this.exportSettings.fps; // Use configurable frame rate
        const stepSize = 1.0 / frameRate; // Frame time based on current fps setting
        const currentDuration = this.getCurrentDuration();
        const newTime = Math.min(this.currentTime + stepSize, currentDuration);
        this.seek(newTime);
    }

    stepBackward() {
        const frameRate = this.exportSettings.fps; // Use configurable frame rate
        const stepSize = 1.0 / frameRate; // Frame time based on current fps setting
        const newTime = Math.max(this.currentTime - stepSize, -0.5);
        this.seek(newTime);
    }

    animate() {
        // If we're not playing, exit early
        if (!this.isPlaying) return;

        try {
            const now = performance.now();
            const bufferTime = 0.5; // Same buffer as in play() method

            // Update current time based on elapsed time
            this.currentTime = (now - this.startTime) / 1000 + bufferTime;

            // Use the current duration which accounts for all elements
            const currentDuration = this.getCurrentDuration();

            // Check if we've reached the end
            if (this.currentTime >= currentDuration + bufferTime) {
                this.stop();
                return;
            }

            // Update note state based on current time (only if we have global events)
            // Note: Note state updates are now handled by scene elements

            // Render the current frame
            this.render();

            // Schedule the next animation frame
            this.animationId = requestAnimationFrame(() => this.animate());
        } catch (error) {
            console.error('Animation error:', error);
            // Safely stop playback if there was an error
            this.isPlaying = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        }
    }

    render() {
        // Only render if invalidated or time has changed
        if (this._needsRender || this.currentTime !== this._lastRenderTime || this.isPlaying) {
            this.renderAtTime(this.currentTime);
            this._needsRender = false;
            this._lastRenderTime = this.currentTime;
        }
    }

    // Force a re-render on next frame
    invalidateRender() {
        this._needsRender = true;
        // Dispatch event to notify React component
        if (this.canvas) {
            this.canvas.dispatchEvent(new CustomEvent('visualizer-update'));
        }
    }

    // Stateless render method - can render any frame without maintaining state
    renderAtTime(targetTime) {
        // Use the new modular rendering system
        const config = this.getSceneConfig();
        const renderObjects = this.sceneBuilder.buildScene(config, targetTime);
        this.modularRenderer.render(this.ctx, renderObjects, config, targetTime);
    }

    /**
     * Set up image loaded event listener for auto re-render when images finish loading
     * @private
     */
    _setupImageLoadedListener() {
        // Remove any existing listener first to prevent duplicates
        document.removeEventListener('imageLoaded', this._handleImageLoaded);

        // Debounce variables to prevent render thrashing
        this._imageLoadDebounceTimeout = null;
        this._pendingImageLoads = new Set();

        // Create bound method reference to ensure proper 'this' context
        this._handleImageLoaded = (event) => {
            // Store the image source that was loaded
            if (event.detail && event.detail.imageSource) {
                this._pendingImageLoads.add(event.detail.imageSource);
            }

            // Clear any existing timeout to debounce multiple loads
            if (this._imageLoadDebounceTimeout) {
                clearTimeout(this._imageLoadDebounceTimeout);
            }

            // Set a timeout to batch multiple image loads into a single re-render
            this._imageLoadDebounceTimeout = setTimeout(() => {
                console.log(`Image load complete, rendering ${this._pendingImageLoads.size} images`);
                this.invalidateRender();
                // Clear the pending image loads after rendering
                this._pendingImageLoads.clear();
                this._imageLoadDebounceTimeout = null;
            }, 50); // 50ms delay for debouncing multiple loads
        };

        // Add the event listener
        document.addEventListener('imageLoaded', this._handleImageLoaded);
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;

        // Log canvas dimensions for debugging
        console.log(`Canvas resized: width=${this.canvas.width}, height=${this.canvas.height}`);

        // Note: Piano setup is now handled by scene elements
        this.invalidateRender();
    }

    getCurrentTime() {
        return this.currentTime;
    }

    getDuration() {
        return this.getCurrentDuration();
    }

    getIsPlaying() {
        return this.isPlaying;
    }

    // Get access to render objects for advanced customization
    getRenderObjects(targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        return this.sceneBuilder.buildScene(config, targetTime);
    }

    // Allow custom render objects to be added
    renderWithCustomObjects(customRenderObjects, targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        const baseRenderObjects = this.sceneBuilder.buildScene(config, targetTime);
        const allRenderObjects = [...baseRenderObjects, ...customRenderObjects];

        this.modularRenderer.render(this.ctx, allRenderObjects, config, targetTime);
    }

    // Helper method to create configuration object for the renderer
    getSceneConfig() {
        // Define standard theme colors that were previously part of the core
        const themeColors = {
            playheadColor: '#ff6b6b',
            textColor: '#ffffff',
            textTertiaryColor: '#cccccc',
            fontFamily: 'Arial',
            fontWeight: '400'
        };

        // Calculate the current scene duration
        const sceneDuration = this.getCurrentDuration();

        return {
            canvas: this.canvas,
            duration: this.duration,
            sceneDuration: sceneDuration, // Total scene length including all elements
            isPlaying: this.isPlaying, // Add playing state for debugging

            // Debug settings
            showAnchorPoints: this.debugSettings.showAnchorPoints,

            // Theme colors and fonts
            ...themeColors
        };
    }

    // Get scene builder for advanced scene customization
    getSceneBuilder() {
        return this.sceneBuilder;
    }

    // Get modular renderer for advanced rendering control
    getModularRenderer() {
        return this.modularRenderer;
    }

    // Scene management methods for the new dynamic system

    /**
     * Get available scene element types from registry
     * @returns {Array} Array of element type information
     */
    getAvailableSceneElementTypes() {
        // Use the imported registry directly
        return Promise.resolve(sceneElementRegistry.getElementTypeInfo());
    }

    /**
     * Add a scene element dynamically
     * @param {string} type - Element type from registry
     * @param {Object} config - Element configuration
     * @returns {SceneElement|null} The created element
     */
    addSceneElement(type, config = {}) {
        // Use the imported registry directly
        const element = this.sceneBuilder.addElementFromRegistry(type, config);
        if (element) {
            this.invalidateRender();
        }
        return element;
    }

    /**
     * Remove a scene element by ID
     * @param {string} elementId - ID of element to remove
     * @returns {boolean} True if element was removed
     */
    removeSceneElement(elementId) {
        const removed = this.sceneBuilder.removeElement(elementId);
        if (removed) {
            this.invalidateRender();
        }
        return removed;
    }

    /**
     * Update a scene element's configuration
     * @param {string} elementId - ID of element to update
     * @param {Object} config - New configuration values
     * @returns {boolean} True if element was updated
     */
    updateSceneElementConfig(elementId, config) {
        const updated = this.sceneBuilder.updateElementConfig(elementId, config);
        if (updated) {
            this.invalidateRender();
        }
        return updated;
    }

    /**
     * Get a scene element's current configuration
     * @param {string} elementId - ID of element
     * @returns {Object|null} Element configuration or null if not found
     */
    getSceneElementConfig(elementId) {
        return this.sceneBuilder.getElementConfig(elementId);
    }

    /**
     * Get all scene elements
     * @returns {Array} Array of scene elements
     */
    getSceneElements() {
        return this.sceneBuilder.getAllElements();
    }

    /**
     * Export current scene configuration
     * @returns {Object} Serializable scene data
     */
    exportSceneConfig() {
        return this.sceneBuilder.serializeScene();
    }

    /**
     * Import scene configuration
     * @param {Object} sceneData - Scene configuration data
     * @returns {boolean} True if scene was loaded successfully
     */
    importSceneConfig(sceneData) {
        // Temporarily disable image load listener to prevent render thrashing during mass reload
        const originalImageLoadListener = this._handleImageLoaded;
        const pendingImages = [];
        let batchLoadTimeout;

        // Create a temporary handler that just collects sources but doesn't trigger renders
        this._handleImageLoaded = (event) => {
            if (event.detail && event.detail.imageSource) {
                pendingImages.push(event.detail.imageSource);
                console.log('Image loaded during scene import:', pendingImages.length);
            }

            // Clear any existing batch timeout
            if (batchLoadTimeout) {
                clearTimeout(batchLoadTimeout);
            }

            // Set a timeout to restore the handler and render once
            batchLoadTimeout = setTimeout(() => {
                console.log('All images loaded, restoring handler and rendering');
                this._handleImageLoaded = originalImageLoadListener;
                this.invalidateRender();
            }, 100);
        };

        const loaded = this.sceneBuilder.loadScene(sceneData);
        if (loaded) {
            // Force reload of any image elements to ensure proper loading
            const imageElements = this.sceneBuilder.getElementsByType('image');

            // If we have images to load, handle them in batch
            if (imageElements.length > 0) {
                console.log(`Scene imported with ${imageElements.length} images to load`);

                // Process all images with a small delay between each to avoid overwhelming the browser
                imageElements.forEach((imageElement, index) => {
                    const imageSource = imageElement.imageSource;
                    if (imageSource) {
                        setTimeout(() => {
                            console.log(`Reloading image ${index + 1}/${imageElements.length}:`, imageElement.id);
                            imageElement.setImageSource(null);
                            // Small additional delay before setting the source
                            setTimeout(() => {
                                imageElement.setImageSource(imageSource);
                            }, 10);
                        }, index * 20); // Stagger image loading
                    }
                });
            } else {
                // No images to load, restore handler immediately
                this._handleImageLoaded = originalImageLoadListener;
                this.invalidateRender();
            }
        } else {
            // If scene loading failed, restore the original handler
            this._handleImageLoaded = originalImageLoadListener;
        }

        return loaded;
    }

    /**
     * Reset to default scene
     */
    resetToDefaultScene() {
        this.sceneBuilder.createDefaultMIDIScene(this.timingManager);
        this.invalidateRender();
    }

    /**
     * Clean up resources and event listeners
     * Call this when destroying the visualizer instance
     */
    cleanup() {
        // Clean up the image loaded event listener
        if (this._handleImageLoaded) {
            document.removeEventListener('imageLoaded', this._handleImageLoaded);
        }

        // Clear any pending image load debounce timeouts
        if (this._imageLoadDebounceTimeout) {
            clearTimeout(this._imageLoadDebounceTimeout);
            this._imageLoadDebounceTimeout = null;
        }

        // Clear any stored pending image loads
        if (this._pendingImageLoads) {
            this._pendingImageLoads.clear();
        }

        // Cancel any pending animation frames
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Get scene element by ID
     * @param {string} elementId - Element ID
     * @returns {SceneElement|null} The element or null if not found
     */
    getSceneElement(elementId) {
        return this.sceneBuilder.getElement(elementId);
    }

    /**
     * Set scene element visibility
     * @param {string} elementId - Element ID
     * @param {boolean} visible - Visibility state
     */
    setSceneElementVisibility(elementId, visible) {
        const element = this.sceneBuilder.getElement(elementId);
        if (element) {
            element.setVisible(visible);
            this.invalidateRender();
        }
    }

    /**
     * Set scene element z-index
     * @param {string} elementId - Element ID  
     * @param {number} zIndex - Z-index value
     */
    setSceneElementZIndex(elementId, zIndex) {
        const element = this.sceneBuilder.getElement(elementId);
        if (element) {
            element.setZIndex(zIndex);
            this.invalidateRender();
        }
    }

    /**
     * Move scene element to new position in render order
     * @param {string} elementId - Element ID
     * @param {number} newIndex - New index position
     */
    moveSceneElement(elementId, newIndex) {
        if (this.sceneBuilder.moveElement(elementId, newIndex)) {
            this.invalidateRender();
        }
    }

    /**
     * Duplicate a scene element
     * @param {string} sourceId - ID of element to duplicate
     * @param {string} newId - ID for new element
     * @returns {SceneElement|null} The duplicated element
     */
    duplicateSceneElement(sourceId, newId) {
        const element = this.sceneBuilder.duplicateElement(sourceId, newId);
        if (element) {
            this.invalidateRender();
        }
        return element;
    }
}

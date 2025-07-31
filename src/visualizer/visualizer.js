// Main MIDI Visualizer class
import { NoteManager } from '../core/manager';
import { ModularRenderer } from './modular-renderer.js';
import { HybridSceneBuilder } from '../ui/hybrid-scene-builder.js';
import { globalTimingManager } from '../core/timing-manager';
import { sceneElementRegistry } from './scene-element-registry.js';

export class MIDIVisualizer {
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

        // Timing management
        this.timingManager = timingManager || globalTimingManager;

        // Note management system
        this.noteManager = new NoteManager(this.timingManager);

        // Piano roll specific settings (deprecated - moved to TimingManager)
        this.timeUnit = 4; // Time unit in seconds (1 bar at 120 BPM = 2 seconds)
        this.timeUnitBars = 1; // Number of bars to show
        this.beatsPerBar = 4;
        this.bpm = 120; // Default BPM, will be updated from MIDI if available
        this.referenceBpm = 120; // Store original BPM for tempo adjustments

        // Visual settings
        this.noteHeight = 20;
        this.pianoWidth = 0; // No piano needed

        // Note rendering system - using modular approach with RenderObjects
        // Main rendering system - stateless renderer for all drawing operations
        this.modularRenderer = new ModularRenderer(); // New modular renderer
        this.sceneBuilder = new HybridSceneBuilder(); // Scene builder for creating RenderObjects

        // Animation system - now handled by individual scene elements

        // Played notes tracking
        // (Note: playedNoteEvents and totalNoteEvents are now managed by noteManager)

        // Color settings - now managed by individual scene elements, keeping only core visualization colors
        this.backgroundColor = '#000000';

        // Listen for image loaded events to automatically re-render
        this._setupImageLoadedListener();
        this.channelColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F8C471', '#82E0AA', '#F1948A', '#85DEEE', '#D7BDE2'
        ];

        this.setupPiano();

        // Initialize the default scene
        this.sceneBuilder.createDefaultMIDIScene(this.timingManager);
    }

    setupPiano() {
        if (!this.canvas) {
            console.error('Canvas not available for piano setup');
            return;
        }

        // Use a more practical note range for visualization (C3 to C6)
        this.noteRange = { min: 48, max: 84 }; // 3 octaves
        this.totalNotes = this.noteRange.max - this.noteRange.min + 1;

        // For piano roll, notes span the full width
        this.noteHeight = (this.canvas.height - 100) / this.totalNotes; // Leave space for progress bar
        this.rollWidth = this.canvas.width; // Full width available for the time axis
    }

    loadMIDIData(midiData) {
        console.log('MIDIVisualizer.loadMIDIData called with:', midiData);

        this.events = midiData.events;
        this.duration = midiData.duration;
        this.currentTime = -0.5; // Start with buffer time so first notes can animate in

        // Load timing data into TimingManager
        if (midiData.timingManager) {
            console.log('Using TimingManager from MIDI data:', midiData.timingManager);
            // Use the TimingManager from MIDI data if available
            this.timingManager = midiData.timingManager;
            this.noteManager = new NoteManager(this.timingManager);

            // Update all scene elements to use the new timing manager
            this.updateSceneElementTimingManager();
        } else {
            console.log('No TimingManager in MIDI data, loading data into global timing manager');
            // Fallback: load data into global timing manager
            this.timingManager.loadFromMIDIData(midiData);
        }

        console.log('TimingManager after loading:', {
            bpm: this.timingManager.bpm,
            tempo: this.timingManager.tempo,
            timeSignature: this.timingManager.timeSignature,
            beatsPerBar: this.timingManager.beatsPerBar
        });

        // Store trimming information for debugging
        this.trimmedTicks = midiData.trimmedTicks || 0;
        this.trimmedSeconds = this.trimmedTicks * this.timingManager.getSecondsPerTick();

        // Get timing values from TimingManager
        this.bpm = this.timingManager.bpm;
        this.beatsPerBar = this.timingManager.beatsPerBar;
        this.referenceBpm = this.bpm; // Store original BPM as reference

        // Calculate time unit in seconds based on TimingManager
        this.updateTimeUnit();

        // Group events by note for better visualization
        this.noteEvents = new Map();

        for (const event of this.events) {
            if (!this.noteEvents.has(event.note)) {
                this.noteEvents.set(event.note, []);
            }
            this.noteEvents.get(event.note).push(event);
        }

        // Load MIDI data into note manager
        this.noteManager.loadMIDIData(this.events, this.timeUnit);
    }

    updateTimeUnit() {
        // Use TimingManager to calculate time unit
        this.timeUnit = this.timingManager.getTimeUnitDuration(this.timeUnitBars);

        // Log timing information for debugging
        this.timingManager.logConfiguration();
    }

    updateSceneElementTimingManager() {
        // The most reliable way to update timing manager references is to recreate the scene
        // This ensures all elements get the correct timing manager reference
        this.sceneBuilder.createDefaultMIDIScene(this.timingManager);
    }

    setTimeUnitBars(bars) {
        this.timeUnitBars = bars;
        this.updateTimeUnit();
        // Update note manager with new time unit
        this.noteManager.updateTimeUnit(this.events, this.timeUnit);
        this.render();
    }

    setBeatsPerBar(beats) {
        this.timingManager.setBeatsPerBar(beats);
        this.beatsPerBar = this.timingManager.beatsPerBar; // Update local copy
        this.updateTimeUnit();
        // Update note manager with new time unit
        this.noteManager.updateTimeUnit(this.events, this.timeUnit);
        this.render();
    }

    setTimeSignature(timeSignature) {
        this.timingManager.setTimeSignature(timeSignature);
        this.beatsPerBar = this.timingManager.beatsPerBar; // Update local copy
        this.updateTimeUnit();
        // Update note manager with new time unit
        this.noteManager.updateTimeUnit(this.events, this.timeUnit);
        this.render();
    }

    setBPM(bpm) {
        try {
            const oldBpm = this.bpm;
            this.timingManager.setBPM(bpm);
            this.bpm = this.timingManager.bpm; // Update local copy

            // Let note manager handle the recalculation
            this.noteManager.recalculateNoteTimings(oldBpm, bpm, this.events, this.timeUnit);

            // Recalculate duration using TimingManager
            const tempoRatio = this.timingManager.calculateTempoRatio(oldBpm, bpm);
            this.duration = this.timingManager.scaleTimeByTempo(this.duration, tempoRatio);

            // Reset animation frame and timing state to prevent any leftover state
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }

            // Update time unit and redraw
            this.updateTimeUnit();
            this.render();

            console.log(`BPM changed from ${oldBpm} to ${bpm}, new duration: ${this.duration.toFixed(2)}s`);
        } catch (error) {
            console.error('Error updating BPM:', error);
        }
    }

    setBPMFromMIDITempo(tempo) {
        if (!tempo) return;
        const oldBpm = this.bpm;
        this.timingManager.setTempo(tempo);
        this.bpm = this.timingManager.bpm; // Update local copy

        // Let note manager handle the recalculation
        this.noteManager.recalculateNoteTimings(oldBpm, this.bpm, this.events, this.timeUnit);

        // Recalculate duration using TimingManager
        const tempoRatio = this.timingManager.calculateTempoRatio(oldBpm, this.bpm);
        this.duration = this.timingManager.scaleTimeByTempo(this.duration, tempoRatio);

        this.updateTimeUnit();
        this.render();
    }

    play() {
        // Check if we have global events OR if any scene elements have their own MIDI data
        const hasGlobalEvents = this.events.length > 0;
        const hasElementEvents = this.getCurrentDuration() > 0;

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

        // Reset note tracking state
        this.noteManager.resetTracking();

        // Redraw with new state
        this.render();
    }

    seek(time) {
        const bufferTime = 0.5; // Same buffer as in other methods
        const currentDuration = this.getCurrentDuration();
        this.currentTime = Math.max(-bufferTime, Math.min(time, currentDuration + bufferTime));

        // Reset and update note manager tracking (only if we have global events)
        if (this.events.length > 0) {
            this.noteManager.resetTracking();
            this.noteManager.updatePlayedNoteEvents(this.events, this.currentTime);
        }

        // If playing, update start time to maintain correct playback position
        if (this.isPlaying) {
            this.startTime = performance.now() - ((this.currentTime + 0.5) * 1000);
        }

        // Update active notes for current time (only if we have global events)
        if (this.events.length > 0) {
            this.noteManager.updateActiveNotes(this.events, this.currentTime);
        }
        this.render();
    }

    getCurrentDuration() {
        // Get maximum duration from all elements with timing managers
        const maxDuration = this.sceneBuilder.getMaxDuration();

        // If we have elements with their own durations, use that, otherwise fallback to loaded MIDI duration
        return maxDuration > 0 ? maxDuration : this.duration;
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
            if (this.events.length > 0) {
                this.noteManager.updateActiveNotes(this.events, this.currentTime);
                this.noteManager.updatePlayedNoteEvents(this.events, this.currentTime);
            }

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
        // Use the stateless rendering system
        this.renderAtTime(this.currentTime);
    }

    // Stateless render method - can render any frame without maintaining state
    renderAtTime(targetTime) {
        // Use the new modular rendering system
        const config = this.getSceneConfig();
        const renderObjects = this.sceneBuilder.buildScene(config, targetTime);
        this.modularRenderer.render(this.ctx, renderObjects, config, targetTime);
    }

    isBlackKey(midiNote) {
        const noteInOctave = midiNote % 12;
        return [1, 3, 6, 8, 10].includes(noteInOctave); // C#, D#, F#, G#, A#
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
                this.render();
                // Clear the pending image loads after rendering
                this._pendingImageLoads.clear();
                this._imageLoadDebounceTimeout = null;
            }, 50); // 50ms delay for debouncing multiple loads
        };

        // Add the event listener
        document.addEventListener('imageLoaded', this._handleImageLoaded);
    } resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;

        // Log canvas dimensions for debugging
        console.log(`Canvas resized: width=${this.canvas.width}, height=${this.canvas.height}`);

        this.setupPiano();
        this.render();
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

    // Get played note events statistics
    getPlayedNotesStats() {
        return this.noteManager.getPlayedNotesStats();
    }

    // Color control methods (core visualization colors only)
    setBackgroundColor(color) {
        this.backgroundColor = color || '#000000';
        this.render();
    }

    getBackgroundColor() {
        return this.backgroundColor;
    }

    setChannelColor(channel, color) {
        if (channel >= 0 && channel < this.channelColors.length && color) {
            this.channelColors[channel] = color;
            this.render();
        }
    }

    getChannelColor(channel) {
        return this.channelColors[channel % this.channelColors.length];
    }

    setChannelColors(colors) {
        if (Array.isArray(colors) && colors.length > 0) {
            this.channelColors = [...colors];
            this.render();
        }
    }

    getChannelColors() {
        return [...this.channelColors];
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
        return {
            canvas: this.canvas,
            noteBlocks: this.noteManager.getNoteBlocks(),
            noteRange: this.noteRange,
            totalNotes: this.totalNotes,
            noteHeight: this.noteHeight,
            timeUnit: this.timeUnit,
            duration: this.duration,
            pianoWidth: this.pianoWidth,
            rollWidth: this.rollWidth,
            beatsPerBar: this.timingManager.beatsPerBar, // Always use current timing manager value
            timeUnitBars: this.timeUnitBars,
            bpm: this.timingManager.bpm, // Always use current timing manager value
            backgroundColor: this.backgroundColor,
            channelColors: this.channelColors,
            playedNoteEvents: this.noteManager.playedNoteEvents,
            totalNoteEvents: this.noteManager.totalNoteEvents,
            events: this.events,
            isPlaying: this.isPlaying // Add playing state for debugging
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
            this.render();
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
            this.render();
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
            this.render();
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
                this.render();
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
                this.render();
            }
        } else {
            // If scene loading failed, restore the original handler
            this._handleImageLoaded = originalImageLoadListener;
        }

        return loaded;
    }    /**
     * Reset to default scene
     */
    resetToDefaultScene() {
        this.sceneBuilder.createDefaultMIDIScene(this.timingManager);
        this.render();
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
    }    /**
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
            this.render();
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
            this.render();
        }
    }

    /**
     * Move scene element to new position in render order
     * @param {string} elementId - Element ID
     * @param {number} newIndex - New index position
     */
    moveSceneElement(elementId, newIndex) {
        if (this.sceneBuilder.moveElement(elementId, newIndex)) {
            this.render();
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
            this.render();
        }
        return element;
    }
}

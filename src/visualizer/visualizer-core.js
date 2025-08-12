// Main MIDI Visualizer class
import { ModularRenderer } from './modular-renderer.js';
import { sceneElementRegistry } from './scene-element-registry.js';
import { globalMacroManager } from './macro-manager.ts';
import { HybridSceneBuilder } from './scene-builder.js';

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
            width: 1500,
            height: 1500,
            fullDuration: true,
        };
        // Initialize RAF pacing
        this._rafMinIntervalMs = 1000 / this.exportSettings.fps;

        // Debug settings
        this.debugSettings = {
            showAnchorPoints: false,
        };

        // Render invalidation system
        this._needsRender = true;
        this._lastRenderTime = -1;
        this._lastRAFTime = 0;
        this._rafMinIntervalMs = 0; // computed from exportSettings.fps when playing

        // Note rendering system - using modular approach with RenderObjects
        // Main rendering system - stateless renderer for all drawing operations
        this.modularRenderer = new ModularRenderer(); // New modular renderer
        this.sceneBuilder = new HybridSceneBuilder(); // Scene builder for creating RenderObjects

        this._setupImageLoadedListener();

        // Initialize the default scene
        this.sceneBuilder.createDefaultMIDIScene();

        // Interaction state (hover/select/drag) for editor tooling
        this._interactionState = {
            hoverElementId: null,
            selectedElementId: null,
            draggingElementId: null,
            activeHandle: null, // id of active transform handle (e.g., scale-nw, rotate, anchor)
        };
        this._interactionBoundsCache = new Map(); // elementId -> bounds (last computed frame)
        this._interactionHandlesCache = new Map(); // elementId -> handles array (last frame)

        // For debug: add to window for easy access in console
        window.vis = this;
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
            elementDuration: this.getCurrentDuration(),
        });

        if (!hasGlobalEvents && !hasElementEvents) {
            console.log('No MIDI data available to play (neither global nor element-specific)');
            return;
        }

        this.isPlaying = true;
        // Add a small buffer time (0.5 seconds) before the actual MIDI content starts
        // This allows the first notes to have their onset animations
        const bufferTime = 0.5; // seconds
        this.startTime = performance.now() - (this.currentTime - bufferTime) * 1000;
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
            this.startTime = performance.now() - (this.currentTime + 0.5) * 1000;
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
            fileName: midiData.fileName || 'Unknown',
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
            // Prefer new MidiManager API if present
            if (element.midiManager && element.midiManager.loadMIDIData) {
                element.midiManager.loadMIDIData(midiData, notes, true);
                console.log(`Loaded MIDI data into piano roll element '${element.id}' via MidiManager`);
            } else if (element.timingManager && element.timingManager.loadMIDIData) {
                // Backward compatibility
                element.timingManager.loadMIDIData(midiData, notes, true);
                console.log(`Loaded MIDI data into piano roll element '${element.id}' via timingManager (legacy)`);
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
            } else if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
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
                        channel: event.channel || 0,
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
                channel: noteOnEvent.channel || 0,
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
     * @param {number} settings.width - Export width
     * @param {number} settings.height - Export height
     * @param {boolean} settings.fullDuration - Whether to export full duration
     */
    updateExportSettings(settings) {
        this.exportSettings = { ...this.exportSettings, ...settings };
        // Update RAF pacing based on fps
        const fps = Math.max(1, this.exportSettings.fps || 30);
        this._rafMinIntervalMs = 1000 / fps;
        // Trigger a re-render when export settings (including resolution) change
        this.invalidateRender();
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
            // Simple RAF pacing to reduce CPU usage; allow frames to drop if too slow
            if (this._rafMinIntervalMs > 0 && now - this._lastRAFTime < this._rafMinIntervalMs * 0.75) {
                this.animationId = requestAnimationFrame(() => this.animate());
                return;
            }
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
            this._lastRAFTime = now;
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

        // If we're NOT playing, the normal animation loop won't call render().
        // Schedule a one-off RAF to perform the render so actions like seek, frame step,
        // element config edits, resolution changes, etc. update the canvas immediately.
        if (!this.isPlaying) {
            if (!this._pendingRenderRAF) {
                this._pendingRenderRAF = requestAnimationFrame(() => {
                    this._pendingRenderRAF = null;
                    try {
                        this.render();
                    } catch (e) {
                        console.warn('Deferred render failed', e);
                    }
                });
            }
        }

        // Dispatch event to notify React component; avoid flooding by batching to next microtask
        if (this.canvas && !this._pendingVisUpdate) {
            this._pendingVisUpdate = true;
            Promise.resolve().then(() => {
                this._pendingVisUpdate = false;
                try {
                    this.canvas.dispatchEvent(new CustomEvent('visualizer-update'));
                } catch {}
            });
        }
    }

    // Stateless render method - can render any frame without maintaining state
    renderAtTime(targetTime) {
        // Use the new modular rendering system
        const config = this.getSceneConfig();
        const renderObjects = this.sceneBuilder.buildScene(config, targetTime);
        this.modularRenderer.render(this.ctx, renderObjects, config, targetTime);
        // Draw interaction overlays (selection / hover / drag)
        try {
            this._renderInteractionOverlays(targetTime, config);
        } catch (e) {
            // Non-fatal
            // console.warn('Interaction overlay render failed', e);
        }
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
        // Immediately render a frame so the preview updates without needing playback.
        // If currentTime is before 0 (buffer period), clamp to 0 for a more informative static preview.
        try {
            if (!this.isPlaying) {
                const previewTime = this.currentTime < 0 ? 0 : this.currentTime;
                this.renderAtTime(previewTime);
            }
        } catch (e) {
            console.warn('Resize immediate render failed', e);
        }
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
            fontWeight: '400',
        };

        // Calculate the current scene duration
        const sceneDuration = this.getCurrentDuration();

        return {
            canvas: this.canvas,
            duration: this.duration,
            sceneDuration: sceneDuration, // Total scene length including all elements
            isPlaying: this.isPlaying, // Add playing state for debugging
            backgroundColor: '#000000',

            // Debug settings
            showAnchorPoints: this.debugSettings.showAnchorPoints,

            // Theme colors and fonts
            ...themeColors,
        };
    }

    // Get scene builder for advanced scene customization
    getSceneBuilder() {
        return this.sceneBuilder;
    }

    /** Set interaction (hover / selection / dragging) state */
    setInteractionState(partial) {
        if (!this._interactionState) return;
        let changed = false;
        for (const k of Object.keys(partial || {})) {
            if (this._interactionState[k] !== partial[k]) {
                this._interactionState[k] = partial[k];
                changed = true;
            }
        }
        if (changed) this.invalidateRender();
    }

    /** Get bounds for all visible elements at a given time (used for hit detection) */
    getElementBoundsAtTime(targetTime = this.currentTime) {
        const config = this.getSceneConfig();
        const elements = [...this.sceneBuilder.elements].filter((e) => e.visible);
        // Sort by zIndex ascending (later ones on top visually)
        elements.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const results = [];
        for (const el of elements) {
            try {
                // Build render objects (will apply transforms) and get their aggregate bounds
                const ros = el.buildRenderObjects(config, targetTime);
                if (ros && ros.length) {
                    const container = ros[0];
                    if (container && typeof container.getBounds === 'function') {
                        const b = container.getBounds();
                        if (b && isFinite(b.x) && isFinite(b.y) && isFinite(b.width) && isFinite(b.height)) {
                            results.push({ id: el.id, zIndex: el.zIndex || 0, bounds: { ...b }, element: el });
                        }
                    }
                }
            } catch {}
        }
        return results;
    }

    /** Internal: draw hover/selection bounding boxes */
    _renderInteractionOverlays(targetTime, config) {
        if (!this._interactionState) return;
        const { hoverElementId, selectedElementId, draggingElementId, activeHandle } = this._interactionState;
        if (!hoverElementId && !selectedElementId && !draggingElementId) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);

        const needed = new Set([hoverElementId, selectedElementId, draggingElementId].filter(Boolean));
        if (needed.size === 0) {
            ctx.restore();
            return;
        }
        // Compute bounds for needed elements (cache per current frame key)
        const boundsList = this.getElementBoundsAtTime(targetTime);
        const map = new Map(boundsList.map((r) => [r.id, r.bounds]));

        const draw = (id, strokeStyle) => {
            if (!id) return;
            const b = map.get(id);
            if (!b) return;
            ctx.strokeStyle = strokeStyle;
            ctx.strokeRect(b.x, b.y, b.width, b.height);
        };
        // Draw order: dragging on top, then hover, then selected under (so active drag color dominates)
        if (selectedElementId && selectedElementId !== draggingElementId) draw(selectedElementId, '#00FFFF'); // cyan
        if (hoverElementId && hoverElementId !== draggingElementId && hoverElementId !== selectedElementId)
            draw(hoverElementId, '#FFFF00'); // yellow
        if (draggingElementId) draw(draggingElementId, '#FF00FF'); // magenta

        // Draw transform handles for selected element (not while playing to avoid clutter)
        if (selectedElementId) {
            try {
                const handles = this.getSelectionHandlesAtTime(selectedElementId, targetTime);
                if (handles && handles.length) {
                    // Draw rotation line (if rotation handle present)
                    const rotHandle = handles.find((h) => h.type === 'rotate');
                    const anchorHandle = handles.find((h) => h.type === 'anchor');
                    if (rotHandle && anchorHandle) {
                        ctx.save();
                        ctx.setLineDash([]);
                        ctx.strokeStyle = '#FFA500';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(anchorHandle.cx, anchorHandle.cy - anchorHandle.size * 0.5);
                        ctx.lineTo(rotHandle.cx, rotHandle.cy);
                        ctx.stroke();
                        ctx.restore();
                    }
                    for (const h of handles) {
                        ctx.save();
                        ctx.setLineDash([]);
                        // Visual style by handle type
                        let fill = '#222';
                        let stroke = '#FFF';
                        if (h.type.startsWith('scale')) {
                            fill = '#00AAFF';
                            stroke = '#FFFFFF';
                        } else if (h.type === 'rotate') {
                            fill = '#FFA500';
                            stroke = '#FFFFFF';
                        } else if (h.type === 'anchor') {
                            fill = '#FFFF00';
                            stroke = '#333333';
                        }
                        if (activeHandle === h.id) {
                            stroke = '#FF00FF';
                        }
                        ctx.strokeStyle = stroke;
                        ctx.fillStyle = fill;
                        if (h.shape === 'circle') {
                            ctx.beginPath();
                            ctx.arc(h.cx, h.cy, h.r, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.stroke();
                        } else {
                            ctx.beginPath();
                            ctx.rect(h.cx - h.size * 0.5, h.cy - h.size * 0.5, h.size, h.size);
                            ctx.fill();
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                }
            } catch (e) {
                // non-fatal
            }
        }
        ctx.restore();
    }

    /** Compute transform selection handles for an element at a given time */
    getSelectionHandlesAtTime(elementId, targetTime = this.currentTime) {
        if (!elementId) return [];
        const cacheKey = `${elementId}:${Math.floor(targetTime * 1000)}`;
        if (this._interactionHandlesCache.has(cacheKey)) return this._interactionHandlesCache.get(cacheKey);
        const boundsList = this.getElementBoundsAtTime(targetTime);
        const record = boundsList.find((b) => b.id === elementId);
        if (!record) return [];
        const b = record.bounds;
        const element = record.element;
        const handles = [];
        const size = Math.max(6, Math.min(18, Math.min(b.width, b.height) * 0.08));
        const anchorX = element ? element.anchorX : 0.5;
        const anchorY = element ? element.anchorY : 0.5;
        const anchorPixelX = b.x + b.width * anchorX;
        const anchorPixelY = b.y + b.height * anchorY;
        const addHandle = (id, type, cx, cy, shape = 'rect', extra = {}) => {
            handles.push({ id, type, cx, cy, size, shape, r: size * 0.5, ...extra });
        };
        // Corner scale handles
        addHandle('scale-nw', 'scale-nw', b.x, b.y);
        addHandle('scale-ne', 'scale-ne', b.x + b.width, b.y);
        addHandle('scale-se', 'scale-se', b.x + b.width, b.y + b.height);
        addHandle('scale-sw', 'scale-sw', b.x, b.y + b.height);
        // Edge scale handles
        addHandle('scale-n', 'scale-n', b.x + b.width / 2, b.y);
        addHandle('scale-e', 'scale-e', b.x + b.width, b.y + b.height / 2);
        addHandle('scale-s', 'scale-s', b.x + b.width / 2, b.y + b.height);
        addHandle('scale-w', 'scale-w', b.x, b.y + b.height / 2);
        // Anchor handle
        addHandle('anchor', 'anchor', anchorPixelX, anchorPixelY, 'rect');
        // Rotation handle (circle) above top-center
        const rotOffset = Math.min(60, Math.max(25, b.height * 0.15));
        addHandle('rotate', 'rotate', b.x + b.width / 2, b.y - rotOffset, 'circle');
        this._interactionHandlesCache.set(cacheKey, handles);
        // Prune cache
        if (this._interactionHandlesCache.size > 50) {
            const keys = Array.from(this._interactionHandlesCache.keys()).slice(0, 10);
            for (const k of keys) this._interactionHandlesCache.delete(k);
        }
        return handles;
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

        // Cancel any deferred render RAF
        if (this._pendingRenderRAF) {
            cancelAnimationFrame(this._pendingRenderRAF);
            this._pendingRenderRAF = null;
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

import { MIDIVisualizer } from '../visualizer/visualizer.js';
import { SceneEditorUI } from './scene-editor-ui.js';
import { sceneElementRegistry } from '../visualizer/scene-element-registry.js';
import { MIDIParser } from '../core/midi-parser';
import { ImageSequenceGenerator } from '../core/image-sequence-generator';
import { globalTimingManager } from '../core/timing-manager';
import { SceneNameGenerator } from './scene-name-generator.js';
import { MacroConfigUI } from './macro-config-ui.js';

let visualizer;
let sceneEditor;
let imageSequenceGenerator;
let macroConfigUI;
let isPlaying = false;
let currentMidiData = null;

// Create parseMIDI function wrapper
async function parseMIDI(input) {
    console.log('parseMIDI called with:', input);
    console.log('Type of input:', typeof input);
    console.log('Is instance of File?', input instanceof File);
    console.log('Is instance of ArrayBuffer?', input instanceof ArrayBuffer);

    const parser = new MIDIParser();

    try {
        // If it's already a File object with arrayBuffer method
        if (input instanceof File && typeof input.arrayBuffer === 'function') {
            console.log('Input is a File with arrayBuffer method, using directly');
            const result = await parser.parseMIDIFile(input);
            console.log('MIDI file successfully parsed');
            return result;
        }

        // If it's a File object without arrayBuffer method (older browsers)
        if (input instanceof File && typeof input.arrayBuffer !== 'function') {
            console.log('File object without arrayBuffer method, using FileReader fallback');
            // Use FileReader as fallback
            const arrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('FileReader error'));
                reader.readAsArrayBuffer(input);
            });

            // Create a mock file object with arrayBuffer method
            const mockFile = {
                arrayBuffer: () => Promise.resolve(arrayBuffer),
                name: input.name
            };
            const result = await parser.parseMIDIFile(mockFile);
            console.log('MIDI file successfully parsed using FileReader');
            return result;
        }

        // If it's an ArrayBuffer
        if (input instanceof ArrayBuffer) {
            console.log('Input is an ArrayBuffer, creating mock File');
            // Create a mock file with arrayBuffer method
            const mockFile = {
                arrayBuffer: () => Promise.resolve(input),
                name: 'midi-data.mid'
            };
            const result = await parser.parseMIDIFile(mockFile);
            console.log('MIDI file successfully parsed from ArrayBuffer');
            return result;
        }

        // If we don't know what it is, throw error
        throw new Error('Unsupported input type for MIDI parsing');
    } catch (error) {
        console.error('Error parsing MIDI file:', error);
        throw error;
    }
}

// Initialize the application
async function init() {
    try {
        console.log('Initializing MIDI Visualizer');
        const canvas = document.getElementById('canvas');
        visualizer = new MIDIVisualizer(canvas);
        imageSequenceGenerator = new ImageSequenceGenerator(canvas, visualizer);

        // Create scene editor
        console.log('Creating Scene Editor UI');
        const editorContainer = document.getElementById('sceneEditorContainer');
        sceneEditor = visualizer.createSceneEditor(editorContainer);
        console.log('Scene Editor created:', sceneEditor);

        // Set global reference for onclick handlers
        window.sceneEditorUI = sceneEditor;

        // Initialize macro configuration UI
        console.log('Creating Macro Configuration UI');
        const macroContainer = document.getElementById('macroConfigContainer');
        macroConfigUI = new MacroConfigUI(macroContainer);
        macroConfigUI.setSceneBuilder(sceneEditor.sceneBuilder);

        // Initialize with a random scene name
        const displayElement = document.getElementById('sceneNameDisplay');
        if (displayElement) {
            displayElement.textContent = SceneNameGenerator.generate();
        }

        // Make sure global settings are shown when nothing is selected
        ensureGlobalSettingsVisibility();
    } catch (error) {
        console.error('Error initializing application:', error);
    }

    // Listen for when individual elements load MIDI files
    document.addEventListener('elementMIDIChanged', handleElementMIDIChanged);

    // Set up global settings event listeners
    setupGlobalSettingsListeners();

    // Set up initial settings
    applyInitialSettings();

    // Update time display
    setInterval(updateTimeDisplay, 100);

    // Setup seek bar interactions
    setupSeekBar();

    console.log('🎵 Dynamic MIDI Visualizer initialized!');
    console.log('Available scene elements:', await visualizer.getAvailableSceneElementTypes());
}

function setupGlobalSettingsListeners() {
    // Resolution and export settings
    document.getElementById('resolutionSelect').addEventListener('change', updateCanvasSize);

    // Removed global timing settings - now handled per element
}

function applyInitialSettings() {
    // Set initial canvas size and aspect ratio
    updateCanvasSize();

    // Removed global timing settings - now handled per element
}

function setupChannelColorControls() {
    if (!visualizer) return;

    const channelColorsGrid = document.getElementById('channelColorsGrid');
    const defaultColors = visualizer.getChannelColors();
    channelColorsGrid.innerHTML = '';

    // Create color inputs for each channel
    for (let i = 0; i < defaultColors.length; i++) {
        const channelColorItem = document.createElement('div');
        channelColorItem.className = 'channel-color-item';

        const label = document.createElement('div');
        label.className = 'channel-color-label';
        label.textContent = `Ch ${i + 1}`;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = defaultColors[i];
        colorInput.id = `channelColor${i}`;
        colorInput.addEventListener('change', () => updateChannelColor(i, colorInput.value));

        channelColorItem.appendChild(label);
        channelColorItem.appendChild(colorInput);
        channelColorsGrid.appendChild(channelColorItem);
    }
}

function handleElementMIDIChanged(event) {
    console.log('Element MIDI changed:', event.detail);

    // Check if we have any elements with MIDI data loaded
    const maxDuration = visualizer.getCurrentDuration();

    if (maxDuration > 0) {
        // Enable export button and playback controls
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('exportStatus').textContent = 'Ready to export';

        console.log('🎼 MIDI data loaded in element, max duration:', maxDuration.toFixed(2), 'seconds');
    } else {
        // Disable controls if no MIDI data is available
        document.getElementById('generateBtn').disabled = true;
        document.getElementById('exportStatus').textContent = 'Load MIDI to enable export';
    }
}

function updateUIFromMIDIData() {
    if (!currentMidiData || !visualizer) return;

    // Update beatsPerBar control if we have time signature data
    if (currentMidiData.timeSignature) {
        let beatsPerBar = currentMidiData.timeSignature.numerator;

        // Handle compound meters (like 6/8)
        if (currentMidiData.timeSignature.denominator === 8 && currentMidiData.timeSignature.numerator % 3 === 0) {
            beatsPerBar = currentMidiData.timeSignature.numerator / 3 * 2;
        }

        document.getElementById('beatsPerBar').value = beatsPerBar;
        document.getElementById('timeSignatureNumerator').value = currentMidiData.timeSignature.numerator.toString();
        document.getElementById('timeSignatureDenominator').value = currentMidiData.timeSignature.denominator.toString();
    }

    // Update BPM information if available
    if (currentMidiData.tempo) {
        const bpm = 60000000 / currentMidiData.tempo;
        document.getElementById('bpmInput').value = bpm.toFixed(1);
    }
}

// Settings update functions
function updateCanvasSize() {
    const resolution = parseInt(document.getElementById('resolutionSelect').value) || 1200;
    const canvas = document.getElementById('canvas');

    // For preview, we display it in a square aspect ratio for square exports
    // The actual export will use the selected resolution (which is square)
    canvas.style.width = '400px';
    canvas.style.height = '400px';

    // Set the actual canvas dimensions to match the selected resolution for proper scaling
    canvas.width = resolution;
    canvas.height = resolution;

    // Resize the visualizer to match
    if (visualizer) {
        visualizer.resize(resolution, resolution);
    }
}

// MIDI file handling

function updateBPM() {
    const bpm = parseFloat(document.getElementById('bpmInput').value);
    if (!isNaN(bpm) && bpm > 0 && visualizer) {
        // First properly stop playback and reset state
        if (isPlaying) {
            visualizer.pause(); // Pause first to stop animation loop
        }

        // Reset UI state
        isPlaying = false;
        document.getElementById('playPauseBtn').textContent = '▶️';

        // Then update BPM
        visualizer.setBPM(bpm);
        if (currentMidiData) {
            currentMidiData.tempo = 60000000 / bpm;
        }

        // Finally stop completely which resets the position
        visualizer.stop();

        // Update seek bar to reflect reset position
        updateSeekBar(0);
    }
}

function updateBeatsPerBar() {
    const beats = parseInt(document.getElementById('beatsPerBar').value);
    if (!isNaN(beats) && beats > 0 && visualizer) {
        visualizer.setBeatsPerBar(beats);
    }
}

function updateChannelColor(channel, color) {
    if (visualizer) {
        visualizer.setChannelColor(channel, color);
    }
}

function applyTimeSignature() {
    const numerator = parseInt(document.getElementById('timeSignatureNumerator').value);
    const denominator = parseInt(document.getElementById('timeSignatureDenominator').value);

    if (numerator > 0 && denominator > 0) {
        let beatsPerBar = numerator;

        // Handle compound meters (like 6/8)
        if (denominator === 8 && numerator % 3 === 0) {
            beatsPerBar = numerator / 3 * 2;
        }

        document.getElementById('beatsPerBar').value = beatsPerBar;

        // Update the timing manager with the new time signature
        if (visualizer) {
            const timeSignature = {
                numerator: numerator,
                denominator: denominator,
                clocksPerClick: 24,
                thirtysecondNotesPerBeat: 8
            };
            visualizer.setTimeSignature(timeSignature);
        }

        if (currentMidiData) {
            currentMidiData.timeSignature = { numerator, denominator };
        }
    }
}

// Utility functions
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function updateTimeDisplay() {
    if (!visualizer) return;

    const current = visualizer.getCurrentTime();
    const duration = visualizer.getDuration();

    const formatTime = (time) => {
        const minutes = Math.floor(Math.max(0, time) / 60);
        const seconds = Math.floor(Math.max(0, time) % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    document.getElementById('timeDisplay').textContent =
        `${formatTime(current)} / ${formatTime(duration)}`;

    // Update seek bar position
    updateSeekBar();
}

// Export functionality
async function generateImageSequence() {
    if (!currentMidiData) {
        alert('Please load a MIDI file first');
        return;
    }

    try {
        // Disable export button
        document.getElementById('generateBtn').disabled = true;
        document.getElementById('exportStatus').textContent = 'Generating...';

        // Show progress overlay
        const progressOverlay = document.getElementById('progressOverlay');
        const progressSection = document.getElementById('progressSection');
        const downloadSection = document.getElementById('downloadSection');

        progressOverlay.style.display = 'flex';
        progressSection.style.display = 'block';
        downloadSection.style.display = 'none';

        const options = {
            fps: parseInt(document.getElementById('fpsInput').value),
            width: parseInt(document.getElementById('resolutionSelect').value),
            height: parseInt(document.getElementById('resolutionSelect').value),
            sceneName: getSceneName(),
            maxFrames: document.getElementById('fullDurationExport').checked ? null : 300,
            onProgress: (progress) => {
                document.getElementById('progressFill').style.width = `${progress}%`;
                document.getElementById('progressText').textContent = `Generating images... ${Math.round(progress)}%`;
            },
            onComplete: (zipBlob) => {
                // Create download link
                const url = URL.createObjectURL(zipBlob);
                const downloadLink = document.getElementById('downloadLink');
                downloadLink.href = url;

                const filename = `midi-visualization-sequence.zip`;
                downloadLink.download = filename;

                // Show download section
                progressSection.style.display = 'none';
                downloadSection.style.display = 'block';
                document.getElementById('exportStatus').textContent = 'Export complete!';

                // Re-enable export button
                document.getElementById('generateBtn').disabled = false;

                console.log('Image sequence generation complete!', zipBlob.size, 'bytes');

                // Auto-hide overlay after 10 seconds
                setTimeout(() => {
                    progressOverlay.style.display = 'none';
                }, 10000);
            }
        };

        await imageSequenceGenerator.generateImageSequence(options);

    } catch (error) {
        console.error('Error generating image sequence:', error);
        alert('Error generating image sequence. Please try again.');
        document.getElementById('generateBtn').disabled = false;
        document.getElementById('exportStatus').textContent = 'Error occurred';

        // Hide progress overlay
        document.getElementById('progressOverlay').style.display = 'none';
    }
}

// Collapsible sections
window.toggleSection = function (sectionId) {
    const content = document.getElementById(sectionId);
    const toggleIcon = content.previousElementSibling.querySelector('.toggle-icon');

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        content.style.maxHeight = content.scrollHeight + 'px';
        toggleIcon.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        content.style.maxHeight = '0px';
        toggleIcon.textContent = '▶';
    }
};

// Demo scene configurations (keeping existing ones)
const demoScenes = {
    minimal: {
        version: '1.0',
        elements: [
            { type: 'background', id: 'bg', visible: true, zIndex: 0, index: 0 },
            { type: 'pianoRoll', id: 'notes', visible: true, zIndex: 10, showNoteLabels: false, showNoteGrid: false, index: 1 },
            { type: 'playhead', id: 'playhead', visible: true, zIndex: 30, lineWidth: 3, index: 2 }
        ]
    },
    complete: {
        version: '1.0',
        elements: [
            { type: 'background', id: 'bg', visible: true, zIndex: 0, index: 0 },
            { type: 'pianoRoll', id: 'notes', visible: true, zIndex: 10, showNoteLabels: true, showNoteGrid: true, index: 1 },
            { type: 'beatDisplay', id: 'beats', visible: true, zIndex: 20, showGrid: true, showLabels: true, showBarIndicator: true, index: 2 },
            { type: 'playhead', id: 'playhead', visible: true, zIndex: 30, lineWidth: 2, index: 3 },
            { type: 'timeDisplay', id: 'time', visible: true, zIndex: 40, position: 'bottomLeft', showProgress: true, index: 4 },
            { type: 'textOverlay', id: 'text', visible: true, zIndex: 50, justification: 'center', x: 200, y: 40, text: 'My Scene', index: 5 },
            { type: 'progressDisplay', id: 'progress', visible: true, zIndex: 45, showBar: true, showStats: true, position: 'bottom', height: 20, margin: 10, index: 6 }
        ]
    },
    performance: {
        version: '1.0',
        elements: [
            { type: 'background', id: 'bg', visible: true, zIndex: 0, index: 0 },
            { type: 'pianoRoll', id: 'notes', visible: true, zIndex: 10, showNoteLabels: false, showNoteGrid: false, index: 1 },
            { type: 'playhead', id: 'playhead', visible: true, zIndex: 30, lineWidth: 4, index: 2 },
            { type: 'textOverlay', id: 'text', visible: true, zIndex: 50, justification: 'center', x: 200, y: 40, text: 'My Scene', index: 3 }
        ]
    },
    consolidated: {
        version: '1.0',
        elements: [
            { type: 'background', id: 'bg', visible: true, zIndex: 0, index: 0 },
            {
                type: 'timeUnitPianoRoll',
                id: 'main',
                visible: true,
                zIndex: 10,
                timeUnitBars: 1,
                beatsPerBar: 4,
                bpm: 120,
                showNoteGrid: true,
                showNoteLabels: true,
                showNotes: true,
                minNote: 21,
                maxNote: 108,
                showBeatGrid: true,
                showBeatLabels: true,
                showBarIndicator: true,
                playheadLineWidth: 2,
                animationType: 'fade',
                animationSpeed: 1.0,
                animationDuration: 0.5,
                index: 1
            },
            { type: 'timeDisplay', id: 'time', visible: true, zIndex: 40, position: 'bottomLeft', showProgress: true, index: 2 },
            { type: 'textOverlay', id: 'text', visible: true, zIndex: 50, justification: 'center', x: 200, y: 40, text: 'My Scene', index: 3 },
            { type: 'progressDisplay', id: 'progress', visible: true, zIndex: 45, showBar: true, showStats: true, position: 'bottom', height: 20, margin: 10, index: 4 }
        ]
    }
};

// Global functions for buttons (keeping existing ones)
window.getSceneName = function () {
    return document.getElementById('sceneNameDisplay').textContent || 'My Scene';
};

// Scene name editing functions
window.startEditingSceneName = function () {
    const displayElement = document.getElementById('sceneNameDisplay');
    const inputElement = document.getElementById('sceneNameEditInput');

    if (displayElement && inputElement) {
        displayElement.style.display = 'none';
        inputElement.style.display = 'inline-block';
        inputElement.value = displayElement.textContent;
        inputElement.focus();
        inputElement.select();
    }
};

window.finishEditingSceneName = function () {
    const displayElement = document.getElementById('sceneNameDisplay');
    const inputElement = document.getElementById('sceneNameEditInput');

    if (displayElement && inputElement) {
        const newName = inputElement.value.trim() || 'My Scene';
        displayElement.textContent = newName;
        displayElement.style.display = 'inline-block';
        inputElement.style.display = 'none';
    }
};

window.handleSceneNameKeydown = function (event) {
    if (event.key === 'Enter') {
        event.target.blur(); // This will trigger finishEditingSceneName
    } else if (event.key === 'Escape') {
        // Cancel editing - restore original name
        const displayElement = document.getElementById('sceneNameDisplay');
        const inputElement = document.getElementById('sceneNameEditInput');

        if (displayElement && inputElement) {
            displayElement.style.display = 'inline-block';
            inputElement.style.display = 'none';
        }
    }
};

// Scene menu functions
window.toggleSceneMenu = function () {
    const dropdown = document.getElementById('sceneMenuDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
};

// Close scene menu when clicking outside
document.addEventListener('click', function (event) {
    const menuContainer = document.querySelector('.scene-menu-container');
    const dropdown = document.getElementById('sceneMenuDropdown');

    if (dropdown && !menuContainer.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

window.createNewDefaultScene = function () {
    if (confirm('Create a new default scene? This will clear all current elements.')) {
        // Import and use the scene name generator
        import('./scene-name-generator.js').then(({ SceneNameGenerator }) => {
            // Generate a random scene name
            const randomName = SceneNameGenerator.generate();

            // Update the scene name display
            const displayElement = document.getElementById('sceneNameDisplay');
            if (displayElement) {
                displayElement.textContent = randomName;
            }

            // Clear the scene and create default elements
            if (sceneEditor) {
                sceneEditor.sceneBuilder.createDefaultMIDIScene();
                sceneEditor.refreshElementList();
                sceneEditor.showGlobalSettings();

                // Render the new scene
                if (visualizer) {
                    visualizer.render();
                }
            }
        }).catch(console.error);
    }
};

window.playPause = function () {
    if (!visualizer) return;

    if (isPlaying) {
        visualizer.pause();
        document.getElementById('playPauseBtn').textContent = '▶️';
    } else {
        visualizer.play();
        document.getElementById('playPauseBtn').textContent = '⏸️';
    }
    isPlaying = !isPlaying;
};

window.stop = function () {
    if (!visualizer) return;
    visualizer.stop();
    isPlaying = false;
    document.getElementById('playPauseBtn').textContent = '▶️';
    updateSeekBar(0);
};

window.stepForward = function () {
    if (!visualizer) return;

    // Pause if playing
    if (isPlaying) {
        visualizer.pause();
        isPlaying = false;
        document.getElementById('playPauseBtn').textContent = '▶️';
    }

    // Get current time and advance by 1/30 second (assuming 30fps)
    const frameTime = 1 / 30;
    const currentTime = visualizer.getCurrentTime();
    visualizer.seek(currentTime + frameTime);
    updateSeekBar();
};

window.stepBackward = function () {
    if (!visualizer) return;

    // Pause if playing
    if (isPlaying) {
        visualizer.pause();
        isPlaying = false;
        document.getElementById('playPauseBtn').textContent = '▶️';
    }

    // Get current time and go back by 1/30 second (assuming 30fps)
    const frameTime = 1 / 30;
    const currentTime = visualizer.getCurrentTime();
    visualizer.seek(currentTime - frameTime);
    updateSeekBar();
};

// Function to handle seek bar interactions
function setupSeekBar() {
    const seekBarContainer = document.getElementById('seekBarContainer');

    if (seekBarContainer) {
        seekBarContainer.addEventListener('click', function (e) {
            if (!visualizer) return;

            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;

            const duration = visualizer.getDuration();
            const newTime = percent * duration;

            visualizer.seek(newTime);
            updateSeekBar(percent * 100);
        });
    }
}

// Function to update seek bar position
function updateSeekBar(percent = null) {
    const seekBarFill = document.getElementById('seekBarFill');

    if (seekBarFill && visualizer) {
        if (percent === null) {
            const currentTime = visualizer.getCurrentTime();
            const duration = visualizer.getDuration();
            percent = (duration > 0) ? (currentTime / duration) * 100 : 0;
        }

        seekBarFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
};

window.loadDemoScene = function (sceneName) {
    if (!visualizer || !sceneEditor) return;

    const sceneData = demoScenes[sceneName];
    if (sceneData) {
        sceneEditor.setSceneConfig(sceneData);
        console.log('📋 Loaded demo scene:', sceneName);
    }
};

window.addRandomElement = async function () {
    if (!visualizer) return;

    const types = await visualizer.getAvailableSceneElementTypes();
    const randomType = types[Math.floor(Math.random() * types.length)];
    const uniqueId = `${randomType.type}_${Date.now()}`;

    await visualizer.addSceneElement(randomType.type, {
        id: uniqueId,
        zIndex: Math.floor(Math.random() * 100)
    });

    sceneEditor.refreshElementList();
    console.log('🎲 Added random element:', randomType.name);
};

window.exportCurrentScene = function () {
    if (!sceneEditor) return;

    const sceneData = sceneEditor.getSceneConfig();
    const jsonStr = JSON.stringify(sceneData, null, 2);

    // Create and download JSON file
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scene-config.json';
    a.click();
    URL.revokeObjectURL(url);

    console.log('💾 Scene exported to JSON');
};

// Add global function for image sequence generation
window.generateImageSequence = generateImageSequence;

// Add global functions for the menu bar
window.saveScene = function () {
    if (sceneEditor) {
        sceneEditor.handleSaveScene();
    }
};

window.loadScene = function () {
    if (sceneEditor) {
        sceneEditor.handleLoadScene();
    }
};

window.clearScene = function () {
    if (sceneEditor) {
        sceneEditor.handleClearScene();
    }
};

// Ensure global settings are visible when nothing is selected
function ensureGlobalSettingsVisibility() {
    if (!sceneEditor) return;

    const globalSettings = document.getElementById('globalSettings');
    const elementConfig = document.getElementById('elementConfig');

    if (!globalSettings || !elementConfig) return;

    // If nothing is selected, show global settings
    if (!sceneEditor.hasElementSelected()) {
        globalSettings.style.display = 'block';
        elementConfig.style.display = 'none';
    }
}

// Initialize when page loads
init().catch(console.error);
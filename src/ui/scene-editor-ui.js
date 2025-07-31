// Scene Editor UI Manager - React-based UI for managing scene elements
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigEditor } from './components/config-editor';
import { ElementList, ElementDropdown } from './components/scene-editor';

export class SceneEditorUI {
    constructor(container, visualizer) {
        console.log('SceneEditorUI constructor called');

        if (!container) {
            console.error('Container element is required for SceneEditorUI');
            throw new Error('Container element is required for SceneEditorUI');
        }

        if (!visualizer) {
            console.error('Visualizer instance is required for SceneEditorUI');
            throw new Error('Visualizer instance is required for SceneEditorUI');
        }

        this.container = container;
        this.visualizer = visualizer;
        this.elementListRoot = null;
        this.configEditorRoot = null;
        this.dropdownRoot = null;
        this.callbacks = {};

        try {
            if (!visualizer.getSceneBuilder) {
                console.error('getSceneBuilder method not found on visualizer');
                throw new Error('getSceneBuilder method not available on visualizer');
            }

            this.sceneBuilder = visualizer.getSceneBuilder();
            console.log('Scene builder initialized:', this.sceneBuilder);

            if (!this.sceneBuilder) {
                console.error('Scene builder is null or undefined');
                throw new Error('Failed to get scene builder from visualizer');
            }

            if (!this.sceneBuilder.getAllElements) {
                console.error('getAllElements method not found on scene builder');
                throw new Error('Scene builder missing getAllElements method');
            }
        } catch (error) {
            console.error('Error initializing scene builder:', error);
            throw error;
        }

        this.currentSelectedElement = null;
        this.init();
    }

    /**
     * Initialize the UI
     */
    init() {
        this.createUI();
        this.setupEventListeners();
        this.refreshElementList();
    }

    /**
     * Create the UI structure
     */
    createUI() {
        // Find the existing DOM elements
        this.panels = {};
        this.panels.elementList = document.getElementById('elementList');
        this.panels.addLayerBtn = document.getElementById('addLayerBtn');
        this.panels.elementDropdown = document.getElementById('elementDropdown');
        this.panels.elementConfig = document.getElementById('elementConfig');

        if (!this.panels.elementList) {
            console.error('Element list container not found');
            return;
        }

        // Create React roots for different parts
        this.elementListRoot = createRoot(this.panels.elementList);

        if (this.panels.elementConfig) {
            this.configEditorRoot = createRoot(this.panels.elementConfig);
        }

        if (this.panels.elementDropdown) {
            this.dropdownRoot = createRoot(this.panels.elementDropdown);
        }

        // Set up global reference for backward compatibility
        window.sceneEditorUI = this;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Add element button
        if (this.panels.addLayerBtn) {
            this.panels.addLayerBtn.addEventListener('click', (e) => {
                this.toggleElementDropdown();
                e.stopPropagation();
            });
        }

        // Global click handler for deselection
        document.addEventListener('click', (e) => {
            // Only check for deselection when we have something selected
            if (this.currentSelectedElement) {
                const isClickOutside = this.isClickOutsideControls(e.target);
                if (isClickOutside) {
                    console.log('Click outside detected, showing global settings');
                    this.showGlobalSettings();
                    e.stopPropagation();
                }
            }
        });
    }

    /**
     * Check if a click is outside of any controls or interactive elements
     */
    isClickOutsideControls(target) {
        const ignoreSelectors = [
            '.element-item',
            '.btn',
            'button',
            'select',
            'input',
            'label',
            '.form-field',
            '#elementConfig',
            '#globalSettings',
            '.config-editor',
            '.element-controls',
            '.scene-controls',
            '.element-dropdown',
            '.element-dropdown-item',
            '#addLayerBtn',
            '.element-name',
            '.edit-id-btn',
            '.element-id-input',
            '.playback-controls',
            '.setting-group',
            '.panel-header',
            '.properties-content',
            '.properties-panel',
            '.scene-editor-container',
            '.config-editor-form',
            '.scene-editor',
            '.elements-panel'
        ];

        const safeAreaIds = [
            'elementList',
            'sceneEditorContainer',
            'elementConfig',
            'globalSettings',
            'elementDropdown',
            'addLayerBtn'
        ];

        let currentEl = target;
        while (currentEl) {
            if (safeAreaIds.includes(currentEl.id)) {
                return false;
            }

            if (currentEl === this.container) {
                return false;
            }

            // Check if this element matches any of our ignore selectors
            let matchesIgnore = false;
            for (const selector of ignoreSelectors) {
                if (selector.startsWith('.')) {
                    if (currentEl.classList && currentEl.classList.contains(selector.substring(1))) {
                        matchesIgnore = true;
                        break;
                    }
                } else if (selector.startsWith('#')) {
                    if (currentEl.id === selector.substring(1)) {
                        matchesIgnore = true;
                        break;
                    }
                } else {
                    if (currentEl.tagName && currentEl.tagName.toLowerCase() === selector) {
                        matchesIgnore = true;
                        break;
                    }
                }
            }

            if (matchesIgnore) {
                return false;
            }

            currentEl = currentEl.parentElement;
        }

        return true;
    }

    /**
     * Refresh the element list display
     */
    refreshElementList() {
        if (!this.elementListRoot || !this.sceneBuilder) return;

        try {
            const elements = this.sceneBuilder.getAllElements();
            console.log('Refreshing element list with elements:', elements);

            this.elementListRoot.render(
                React.createElement(ElementList, {
                    elements: elements || [],
                    selectedElementId: this.currentSelectedElement,
                    onElementSelect: (elementId) => this.selectElement(elementId),
                    onToggleVisibility: (elementId) => this.toggleElementVisibility(elementId),
                    onMoveElement: (elementId, newIndex) => this.moveElement(elementId, newIndex),
                    onDuplicateElement: (elementId) => this.duplicateElement(elementId),
                    onDeleteElement: (elementId) => this.deleteElement(elementId),
                    onUpdateElementId: (oldId, newId) => this.updateElementId(oldId, newId)
                })
            );
        } catch (error) {
            console.error('Error refreshing element list:', error);
        }
    }

    /**
     * Toggle the element dropdown
     */
    toggleElementDropdown(show) {
        if (!this.panels.elementDropdown || !this.dropdownRoot) return;

        if (show === undefined) {
            // Toggle current visibility
            const isVisible = this.panels.elementDropdown.style.display === 'block';
            show = !isVisible;
        }

        if (show) {
            this.panels.elementDropdown.style.display = 'block';
            this.dropdownRoot.render(
                React.createElement(ElementDropdown, {
                    onAddElement: (elementType) => this.handleAddElement(elementType),
                    onClose: () => this.toggleElementDropdown(false)
                })
            );
        } else {
            this.panels.elementDropdown.style.display = 'none';
        }
    }

    /**
     * Handle adding a new element
     */
    handleAddElement(elementType) {
        if (!elementType) {
            console.error('No element type specified');
            return;
        }

        // Generate unique ID
        const uniqueId = `${elementType}_${Date.now()}`;

        // Add element to scene
        const success = this.sceneBuilder.addElement(elementType, uniqueId);

        if (success) {
            this.refreshElementList();
            this.selectElement(uniqueId);

            // Refresh visualization
            if (this.visualizer && this.visualizer.render) {
                this.visualizer.render();
            }

            // Trigger callback
            if (this.callbacks.onElementAdd) {
                this.callbacks.onElementAdd(elementType, uniqueId);
            }
        }

        this.toggleElementDropdown(false);
    }

    /**
     * Select an element and show its config
     */
    selectElement(elementId) {
        this.currentSelectedElement = elementId;
        this.refreshElementList(); // Update selection visual state

        // Get the element and show its config
        const element = this.sceneBuilder.getElement(elementId);
        if (element) {
            this.showElementConfig(element);
        }

        // Update properties header
        const propertiesHeader = document.getElementById('propertiesHeader');
        if (propertiesHeader && element) {
            const truncatedId = this.truncateText(element.id, 15);
            propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
            propertiesHeader.title = `Properties | ${element.id}`;
        }

        // Trigger callback if set
        if (this.callbacks.onElementSelect) {
            this.callbacks.onElementSelect(elementId);
        }
    }

    /**
     * Show element configuration in the properties panel
     */
    showElementConfig(element) {
        if (!this.configEditorRoot || !this.panels.elementConfig) return;

        const globalSettings = document.getElementById('globalSettings');

        // Hide global settings and show element config
        if (globalSettings) {
            globalSettings.style.display = 'none';
        }
        this.panels.elementConfig.style.display = 'block';

        // Get element configuration and schema
        const elementConfig = this.sceneBuilder.getElementConfig ?
            this.sceneBuilder.getElementConfig(element.id) : element;
        const schema = this.sceneBuilder.sceneElementRegistry.getSchema(element.type);

        if (elementConfig && schema) {
            // Filter out id and visible properties from the schema
            const filteredSchema = {
                ...schema,
                properties: Object.fromEntries(
                    Object.entries(schema.properties).filter(
                        ([key]) => key !== 'id' && key !== 'visible'
                    )
                )
            };

            this.configEditorRoot.render(
                React.createElement(ConfigEditor, {
                    element: elementConfig,
                    schema: filteredSchema,
                    onConfigChange: (elementId, configChanges) => {
                        this.handleElementConfigChange(elementId, configChanges);
                    }
                })
            );
        }
    }

    /**
     * Show global settings in the properties panel
     */
    showGlobalSettings() {
        const globalSettings = document.getElementById('globalSettings');
        const propertiesHeader = document.getElementById('propertiesHeader');

        if (globalSettings && this.panels.elementConfig) {
            globalSettings.style.display = 'block';
            this.panels.elementConfig.style.display = 'none';
        }

        if (propertiesHeader) {
            propertiesHeader.textContent = '⚙️ Properties';
        }

        this.currentSelectedElement = null;
        this.refreshElementList(); // Update selection visual state
    }

    /**
     * Handle element configuration changes
     */
    handleElementConfigChange(elementId, configChanges) {
        console.log('Element config changed:', elementId, configChanges);

        // Update the element configuration
        this.sceneBuilder.updateElementConfig(elementId, configChanges);

        // Refresh visualization
        if (this.visualizer && this.visualizer.render) {
            this.visualizer.render();
        }

        // Trigger callback
        if (this.callbacks.onElementConfigChange) {
            this.callbacks.onElementConfigChange(elementId, configChanges);
        }
    }

    /**
     * Toggle element visibility
     */
    toggleElementVisibility(elementId) {
        const element = this.sceneBuilder.getElement(elementId);
        if (element) {
            element.visible = !element.visible;
            this.refreshElementList();

            // Refresh visualization
            if (this.visualizer && this.visualizer.render) {
                this.visualizer.render();
            }
        }
    }

    /**
     * Move element to new position
     */
    moveElement(elementId, newIndex) {
        const elements = this.sceneBuilder.getAllElements();
        if (newIndex >= 0 && newIndex < elements.length) {
            this.sceneBuilder.moveElement(elementId, newIndex);
            this.refreshElementList();
        }
    }

    /**
     * Duplicate an element
     */
    duplicateElement(elementId) {
        const element = this.sceneBuilder.getElement(elementId);
        if (element) {
            const uniqueId = `${elementId}_copy_${Date.now()}`;
            const success = this.sceneBuilder.addElement(element.type, uniqueId, element.config);

            if (success) {
                this.refreshElementList();
                this.selectElement(uniqueId);
            }
        }
    }

    /**
     * Delete an element
     */
    deleteElement(elementId) {
        if (window.confirm(`Delete element "${elementId}"?`)) {
            this.sceneBuilder.removeElement(elementId);

            // If this was the selected element, clear selection
            if (this.currentSelectedElement === elementId) {
                this.showGlobalSettings();
            }

            this.refreshElementList();

            // Refresh visualization
            if (this.visualizer && this.visualizer.render) {
                this.visualizer.render();
            }

            // Trigger callback
            if (this.callbacks.onElementDelete) {
                this.callbacks.onElementDelete(elementId);
            }
        }
    }

    /**
     * Update an element's ID
     */
    updateElementId(oldId, newId) {
        // Check if new ID already exists
        const existingElement = this.sceneBuilder.getElement(newId);
        if (existingElement && existingElement.id !== oldId) {
            alert(`Element with ID "${newId}" already exists. Please choose a different ID.`);
            return false;
        }

        // Update the element ID
        const success = this.sceneBuilder.updateElementId(oldId, newId);
        if (success) {
            // Update current selection if this was the selected element
            if (this.currentSelectedElement === oldId) {
                this.currentSelectedElement = newId;

                // Update properties header if element is selected
                const propertiesHeader = document.getElementById('propertiesHeader');
                if (propertiesHeader && propertiesHeader.textContent.includes('|')) {
                    const truncatedId = this.truncateText(newId, 15);
                    propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
                    propertiesHeader.title = `Properties | ${newId}`;
                }
            }

            this.refreshElementList();

            // Refresh visualization
            if (this.visualizer && this.visualizer.render) {
                this.visualizer.render();
            }

            // Trigger callback
            if (this.callbacks.onElementIdChange) {
                this.callbacks.onElementIdChange(oldId, newId);
            }
            return true;
        } else {
            alert('Failed to update element ID. Please try again.');
            return false;
        }
    }

    /**
     * Truncate text with ellipsis
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Get currently selected element ID
     */
    getSelectedElementId() {
        return this.currentSelectedElement;
    }

    /**
     * Check if an element is currently selected
     */
    hasElementSelected() {
        return this.currentSelectedElement !== null;
    }

    /**
     * Set callbacks for events
     */
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * Refresh the UI (re-render React components)
     */
    refresh() {
        this.refreshElementList();
        if (this.currentSelectedElement) {
            const element = this.sceneBuilder.getElement(this.currentSelectedElement);
            if (element) {
                this.showElementConfig(element);
            }
        }
    }

    /**
     * Handle save scene - delegate to scene builder
     */
    handleSaveScene() {
        const sceneName = document.getElementById('sceneNameDisplay')?.textContent || 'My Scene';
        const elements = this.sceneBuilder.getAllElements();

        // Create a complete save structure
        const sceneData = {
            sceneName: sceneName,
            elements: elements.map(element => {
                // Always get the full config from the element using the schema
                const schema = this.sceneBuilder.sceneElementRegistry.getSchema(element.type);
                const config = {
                    id: element.id,
                    type: element.type,
                    visible: element.visible,
                    zIndex: element.zIndex
                };

                if (schema && schema.properties) {
                    for (const [key] of Object.entries(schema.properties)) {
                        if (key !== 'id' && key !== 'type' && key !== 'visible' && key !== 'zIndex') {
                            // Check if element has the property
                            if (key in element && element[key] !== undefined) {
                                config[key] = element[key];
                            }
                        }
                    }
                }

                return {
                    type: element.type,
                    id: element.id,
                    visible: element.visible,
                    zIndex: element.zIndex,
                    config: config
                };
            }),
            version: '0.7a',
            savedAt: new Date().toISOString()
        };

        // Create and download JSON file
        const jsonStr = JSON.stringify(sceneData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sceneName.replace(/[^a-zA-Z0-9_]/g, '_')}.json`;
        a.style.display = 'none';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up object URL
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        console.log('Scene saved to file:', sceneData);
    }

    /**
     * Handle load scene - delegate to scene builder
     */
    handleLoadScene() {
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const sceneData = JSON.parse(e.target.result);
                    console.log('Loading scene data:', sceneData);

                    // Update scene name if present
                    if (sceneData.sceneName) {
                        const displayElement = document.getElementById('sceneNameDisplay');
                        if (displayElement) {
                            displayElement.textContent = sceneData.sceneName;
                        }
                    }

                    this.sceneBuilder.clearScene();

                    // Load elements with improved configuration handling
                    for (const elementData of sceneData.elements) {
                        console.log('Loading element:', elementData);

                        // Create the element with basic properties first
                        const success = this.sceneBuilder.addElement(
                            elementData.type,
                            elementData.id,
                            {} // Empty config initially
                        );

                        if (success) {
                            // Get the created element
                            const element = this.sceneBuilder.getElement(elementData.id);
                            if (element) {
                                // Apply visibility and zIndex
                                if (elementData.visible !== undefined) {
                                    element.visible = elementData.visible;
                                }
                                if (elementData.zIndex !== undefined) {
                                    element.zIndex = elementData.zIndex;
                                }

                                // Apply all properties directly from config
                                if (elementData.config) {
                                    // Apply each property individually to ensure proper application
                                    Object.entries(elementData.config).forEach(([key, value]) => {
                                        // Skip id, type, visible, zIndex which are handled separately
                                        if (!['id', 'type', 'visible', 'zIndex'].includes(key) &&
                                            key in element && value !== undefined) {
                                            // Use the setter method if available (e.g., setText, setY, etc.)
                                            const setterMethodName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
                                            if (typeof element[setterMethodName] === 'function') {
                                                element[setterMethodName](value);
                                            } else {
                                                // Direct property assignment as fallback
                                                element[key] = value;
                                            }
                                        }
                                    });

                                    // Also update the element's config object
                                    element.config = { ...element.config, ...elementData.config };
                                }
                            }
                        }
                    }

                    this.refresh();

                    // Refresh visualization
                    if (this.visualizer && this.visualizer.render) {
                        this.visualizer.render();
                    }

                    console.log(`Scene "${file.name}" loaded successfully!`);
                } catch (error) {
                    console.error('Error loading scene:', error);
                    alert('Error loading scene file: ' + error.message);
                }
            };

            reader.readAsText(file);
        });

        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    }

    /**
     * Handle clear scene - delegate to scene builder
     */
    handleClearScene() {
        if (window.confirm('Clear all elements from the scene?')) {
            this.sceneBuilder.clearScene();
            this.showGlobalSettings();
            this.refresh();
        }
    }

    /**
     * Clean up the component
     */
    destroy() {
        if (this.elementListRoot) {
            this.elementListRoot.unmount();
            this.elementListRoot = null;
        }

        if (this.configEditorRoot) {
            this.configEditorRoot.unmount();
            this.configEditorRoot = null;
        }

        if (this.dropdownRoot) {
            this.dropdownRoot.unmount();
            this.dropdownRoot = null;
        }

        // Clean up global reference
        if (window.sceneEditorUI === this) {
            window.sceneEditorUI = null;
        }
    }
}

// Keep global reference for backward compatibility
window.sceneEditorUI = null;
// Scene Editor UI Manager - Complete UI for managing scene elements
import { DynamicConfigEditor } from './dynamic-config-editor.js';
import { sceneElementRegistry } from '../visualizer/scene-element-registry.js';

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
        this.configEditor = null;

        this.panels = {};
        this.callbacks = {};

        this.init();
    }

    /**
     * Initialize the UI
     */
    init() {
        this.createUI();
        this.setupEventListeners();
        this.refreshElementList();
        this.showGlobalSettings(); // Show global settings by default
    }

    /**
     * Create the UI structure for the new layout
     */
    createUI() {
        // Create only the layer panel content (elements list)
        this.container.innerHTML = `
            <div class="scene-editor">
                <div class="elements-panel">
                    <div class="element-list" id="elementList">
                        <!-- Elements will be populated here -->
                    </div>
                </div>
            </div>
        `;

        // Store references
        this.panels.elementList = document.getElementById('elementList');
        this.panels.addLayerBtn = document.getElementById('addLayerBtn');
        this.panels.elementDropdown = document.getElementById('elementDropdown');
        this.panels.addElementBtn = document.getElementById('addElementBtn');

        // Populate element type dropdown
        this.populateElementTypes();
    }

    /**
     * Show global settings in the properties panel
     */
    showGlobalSettings() {
        const globalSettings = document.getElementById('globalSettings');
        const elementConfig = document.getElementById('elementConfig');
        const propertiesHeader = document.getElementById('propertiesHeader');

        if (globalSettings && elementConfig) {
            globalSettings.style.display = 'block';
            elementConfig.style.display = 'none';
        }

        if (propertiesHeader) {
            propertiesHeader.textContent = '⚙️ Properties';
        }

        this.currentSelectedElement = null;
        this.updateElementSelection();
    }

    /**
     * Show element configuration in the properties panel
     */
    showElementConfig(element) {
        const globalSettings = document.getElementById('globalSettings');
        const elementConfig = document.getElementById('elementConfig');
        const propertiesHeader = document.getElementById('propertiesHeader');

        if (globalSettings && elementConfig) {
            globalSettings.style.display = 'none';
            elementConfig.style.display = 'block';

            // Clear and populate element config
            elementConfig.innerHTML = '';

            // Create a new config editor
            this.configEditor = new DynamicConfigEditor(elementConfig);
            this.configEditor.setChangeCallback((elementId, configChanges) => {
                this.handleElementConfigChange(elementId, configChanges);
            });

            // Get element configuration and schema
            const elementConfig_data = this.sceneBuilder.getElementConfig(element.id);
            const schema = this.sceneBuilder.sceneElementRegistry.getSchema(element.type);

            if (elementConfig_data && schema) {
                // Filter out id and visible properties from the schema
                const filteredSchema = {
                    ...schema,
                    properties: Object.fromEntries(
                        Object.entries(schema.properties).filter(
                            ([key]) => key !== 'id' && key !== 'visible'
                        )
                    )
                };

                this.configEditor.showElementConfig(elementConfig_data, filteredSchema);
            }
        }

        // Update the properties header to show the element ID with truncation
        if (propertiesHeader) {
            const truncatedId = this.truncateText(element.id, 15); // Slightly shorter for header
            propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
            propertiesHeader.title = `Properties | ${element.id}`; // Full ID on hover
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Add element button (in the panel header)
        if (this.panels.addLayerBtn) {
            this.panels.addLayerBtn.addEventListener('click', (e) => {
                this.toggleElementDropdown();
                e.stopPropagation(); // Prevent the click from reaching the document
            });
        }

        // Add global click handler for deselection and dropdown hiding
        document.addEventListener('click', (e) => {
            // Close the dropdown when clicking outside
            if (this.panels.elementDropdown && this.panels.elementDropdown.classList.contains('show')) {
                // Only close if not clicking inside the dropdown or the add button
                if (!this.panels.elementDropdown.contains(e.target) &&
                    e.target !== this.panels.addLayerBtn) {
                    this.toggleElementDropdown(false);
                }
            }

            // Only check for deselection when we have something selected
            if (this.currentSelectedElement) {
                // Check if click is outside of any interactive elements
                const isClickOutside = this.isClickOutsideControls(e.target);

                if (isClickOutside) {
                    console.log('Click outside detected, showing global settings');
                    this.showGlobalSettings();

                    // Prevent event propagation to avoid multiple deselects
                    e.stopPropagation();
                }
            }
        });
    }

    /**
     * Check if a click is outside of any controls or interactive elements
     * @param {HTMLElement} target - The clicked element
     * @returns {boolean} - True if the click is outside of any controls
     */
    isClickOutsideControls(target) {
        // List of elements and classes we want to ignore for deselection
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
            '.config-editor-header',
            '.form-field',
            '.field-description',
            '.range-input-container',
            '.checkbox-field',
            '#sceneEditorContainer'
        ];

        // We'll define certain "safe areas" where clicks should never deselect
        const safeAreaIds = [
            'elementList',
            'sceneEditorContainer',
            'elementConfig',
            'globalSettings',
            'elementDropdown',
            'addLayerBtn'
        ];

        // Check if the target or any of its parents match the ignore selectors
        let currentEl = target;
        while (currentEl) {
            // Check for safe areas first - if we're in one of these, never deselect
            if (safeAreaIds.includes(currentEl.id)) {
                return false;
            }

            // If we reach the container element, we're inside the scene editor UI
            if (currentEl === this.container) {
                return false;
            }

            // Check if this element matches any of our ignore selectors
            const matchesIgnore = ignoreSelectors.some(selector => {
                if (selector.startsWith('.')) {
                    return currentEl.classList && currentEl.classList.contains(selector.substring(1));
                } else if (selector.startsWith('#')) {
                    return currentEl.id === selector.substring(1);
                } else {
                    return currentEl.tagName && currentEl.tagName.toLowerCase() === selector;
                }
            });

            if (matchesIgnore) {
                return false;
            }

            currentEl = currentEl.parentElement;
        }

        // If we get here, it's a click in an empty area
        return true;
    }

    /**
     * Populate the element type dropdown
     */
    populateElementTypes() {
        const dropdown = this.panels.elementDropdown;
        const types = sceneElementRegistry.getElementTypeInfo();

        // Clear existing content
        dropdown.innerHTML = '';

        // Group by category
        const categories = {};
        for (const type of types) {
            if (!categories[type.category]) {
                categories[type.category] = [];
            }
            categories[type.category].push(type);
        }

        // Add options by category
        for (const [category, categoryTypes] of Object.entries(categories)) {
            // Add category header
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'element-dropdown-category';
            categoryHeader.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            dropdown.appendChild(categoryHeader);

            // Add items in this category
            for (const type of categoryTypes) {
                const item = document.createElement('div');
                item.className = 'element-dropdown-item';
                item.dataset.elementType = type.type;
                item.textContent = type.name;
                item.title = type.description;

                // Add click handler to add the element directly
                item.addEventListener('click', () => {
                    this.handleAddElement(type.type);
                    this.toggleElementDropdown(false);
                });

                dropdown.appendChild(item);
            }
        }
    }

    /**
     * Refresh the element list display
     */
    refreshElementList() {
        const container = this.panels.elementList;
        if (!container) {
            console.error('Element list container not found');
            return;
        }

        container.innerHTML = '';

        try {
            if (!this.sceneBuilder) {
                console.error('Scene builder not initialized');
                container.innerHTML = '<div class="no-selection">Error: Scene builder not available</div>';
                return;
            }

            if (!this.sceneBuilder.getAllElements) {
                console.error('getAllElements method not found on sceneBuilder');
                container.innerHTML = '<div class="no-selection">Error: getAllElements not available</div>';
                return;
            }

            const elements = this.sceneBuilder.getAllElements();
            console.log('Scene elements:', elements);

            if (!elements || elements.length === 0) {
                container.innerHTML = '<div class="no-selection">No elements in scene</div>';
                return;
            }

            elements.forEach((element, index) => {
                const elementDiv = this.createElementListItem(element, index);
                container.appendChild(elementDiv);
            });
        } catch (error) {
            console.error('Error refreshing element list:', error);
            container.innerHTML = `<div class="no-selection">Error: ${error.message}</div>`;
        }
    }

    /**
     * Truncate text with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length before truncation
     * @returns {string} Truncated text
     */
    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * Create a list item for an element
     */
    createElementListItem(element, index) {
        const typeInfo = sceneElementRegistry.getElementTypeInfo().find(t => t.type === element.type);
        const elementTypeName = typeInfo ? typeInfo.name : element.type;

        // Get all elements to check the length for the "Move down" button
        const allElements = this.sceneBuilder.getAllElements();

        const div = document.createElement('div');
        div.className = `element-item ${this.currentSelectedElement === element.id ? 'selected' : ''}`;
        div.onclick = () => this.selectElement(element.id);

        // Truncate ID for display
        const truncatedId = this.truncateText(element.id, 18);

        div.innerHTML = `
            <div class="element-info">
                <div class="element-name-container">
                    <span class="element-name" id="elementName_${element.id}" 
                          title="${element.id}"
                          ondblclick="event.stopPropagation(); window.sceneEditorUI.startEditingElementId('${element.id}')">${truncatedId}</span>
                    <button class="edit-id-btn" 
                            onclick="event.stopPropagation(); window.sceneEditorUI.startEditingElementId('${element.id}')"
                            title="Edit element ID">✏️</button>
                </div>
                <div class="element-type">${elementTypeName}</div>
            </div>
            <div class="element-controls">
                <button class="visibility-toggle ${element.visible ? 'visible' : ''}" 
                        onclick="event.stopPropagation(); window.sceneEditorUI.toggleElementVisibility('${element.id}')"
                        title="${element.visible ? 'Hide' : 'Show'} element">
                    ${element.visible ? '👁️' : '👁️‍🗨️'}
                </button>
                <div class="z-index-controls">
                    <button onclick="event.stopPropagation(); window.sceneEditorUI.moveElement('${element.id}', ${index - 1})"
                            title="Move up" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button onclick="event.stopPropagation(); window.sceneEditorUI.moveElement('${element.id}', ${index + 1})"
                            title="Move down" ${index === allElements.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
                <button onclick="event.stopPropagation(); window.sceneEditorUI.duplicateElement('${element.id}')"
                        title="Duplicate element">📋</button>
                <button onclick="event.stopPropagation(); window.sceneEditorUI.deleteElement('${element.id}')"
                        title="Delete element">🗑️</button>
            </div>
        `;

        return div;
    }

    /**
     * Update element selection visual state
     */
    updateElementSelection() {
        const elements = this.container.querySelectorAll('.element-item');
        elements.forEach(el => {
            el.classList.remove('selected');
        });

        if (this.currentSelectedElement) {
            const selectedEl = this.container.querySelector(`[onclick*="${this.currentSelectedElement}"]`);
            if (selectedEl) {
                selectedEl.classList.add('selected');
            }
        } else {
            // If nothing is selected, ensure global settings are shown
            this.updateGlobalSettingsVisibility();
        }
    }

    /**
     * Update global settings visibility based on selection state
     */
    updateGlobalSettingsVisibility() {
        const globalSettings = document.getElementById('globalSettings');
        const elementConfig = document.getElementById('elementConfig');

        if (globalSettings && elementConfig) {
            if (!this.currentSelectedElement) {
                globalSettings.style.display = 'block';
                elementConfig.style.display = 'none';
            }
        }
    }

    /**
     * Select an element
     */
    selectElement(elementId) {
        this.currentSelectedElement = elementId;
        this.updateElementSelection();

        // Get the element and show its config
        const element = this.sceneBuilder.getElement(elementId);
        if (element) {
            this.showElementConfig(element);
        }

        // Trigger callback if set
        if (this.callbacks.onElementSelect) {
            this.callbacks.onElementSelect(elementId);
        }
    }

    /**
     * Check if an element is currently selected
     * @returns {boolean} - True if an element is selected
     */
    hasElementSelected() {
        return this.currentSelectedElement !== null;
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
     * Toggle the element dropdown
     * @param {boolean|undefined} show - Force show/hide, or toggle if undefined
     */
    toggleElementDropdown(show) {
        if (!this.panels.elementDropdown) return;

        // If show is undefined, toggle the current state
        if (show === undefined) {
            this.panels.elementDropdown.classList.toggle('show');
        } else {
            // Otherwise explicitly set the state
            if (show) {
                this.panels.elementDropdown.classList.add('show');
            } else {
                this.panels.elementDropdown.classList.remove('show');
            }
        }

        // When showing the dropdown, make sure it's populated
        if (this.panels.elementDropdown.classList.contains('show')) {
            this.populateElementTypes();
        }
    }

    /**
     * Handle adding a new element
     * @param {string} elementType - The type of element to add
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
     * Save scene to file
     */
    handleSaveScene() {
        const sceneName = document.getElementById('sceneNameDisplay').textContent || 'My Scene';
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
                    for (const [key, propSchema] of Object.entries(schema.properties)) {
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
     * Load scene from file
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

                    this.refreshElementList();
                    this.showGlobalSettings();

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
     * Clear the scene
     */
    handleClearScene() {
        if (window.confirm('Clear all elements from the scene?')) {
            this.sceneBuilder.clearScene();
            this.refreshElementList();
            this.showGlobalSettings();
        }
    }

    /**
     * Start editing an element ID
     * @param {string} elementId - Current element ID
     */
    startEditingElementId(elementId) {
        const elementNameSpan = document.getElementById(`elementName_${elementId}`);
        if (!elementNameSpan) return;

        const currentText = elementNameSpan.title || elementId; // Use full ID from title

        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'element-id-input';
        input.style.width = '100%';
        input.style.fontSize = '13px';
        input.style.padding = '2px 4px';
        input.style.border = '1px solid #0e639c';
        input.style.borderRadius = '2px';
        input.style.background = '#3c3c3c';
        input.style.color = '#ffffff';

        // Replace the span with input
        elementNameSpan.parentNode.replaceChild(input, elementNameSpan);
        input.focus();
        input.select();

        // Handle input events
        const finishEditing = (save = false) => {
            if (save && input.value.trim() && input.value.trim() !== elementId) {
                this.updateElementId(elementId, input.value.trim());
            } else {
                // Just refresh to restore the original display
                this.refreshElementList();
            }
        };

        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEditing(false);
            }
        });
    }

    /**
     * Update an element's ID
     * @param {string} oldId - Current element ID
     * @param {string} newId - New element ID
     */
    updateElementId(oldId, newId) {
        // Check if new ID already exists
        const existingElement = this.sceneBuilder.getElement(newId);
        if (existingElement && existingElement.id !== oldId) {
            alert(`Element with ID "${newId}" already exists. Please choose a different ID.`);
            this.refreshElementList();
            return;
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
        } else {
            alert('Failed to update element ID. Please try again.');
            this.refreshElementList();
        }
    }
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * Get currently selected element ID
     */
    getSelectedElementId() {
        return this.currentSelectedElement;
    }

    /**
     * Refresh the UI (useful for external updates)
     */
    refresh() {
        this.refreshElementList();
    }
}

// Make it globally accessible for onclick handlers
window.sceneEditorUI = null;

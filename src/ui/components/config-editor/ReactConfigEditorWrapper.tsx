import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import ConfigEditor from './ConfigEditor';

// React wrapper component that mimics the DynamicConfigEditor interface
export class ReactConfigEditorWrapper {
    private container: HTMLElement;
    private root: Root | null = null;
    private currentElement: any = null;
    private currentSchema: any = null;
    private changeCallback: ((elementId: string, config: { [key: string]: any }) => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    /**
     * Set callback for when configuration changes
     */
    setChangeCallback(callback: (elementId: string, config: { [key: string]: any }) => void) {
        this.changeCallback = callback;
    }

    /**
     * Display configuration form for an element
     */
    showElementConfig(elementConfig: any, schema: any) {
        this.currentElement = elementConfig;
        this.currentSchema = schema;
        this.renderForm();
    }

    /**
     * Clear the configuration form
     */
    clear() {
        this.currentElement = null;
        this.currentSchema = null;
        this.renderForm();
    }

    /**
     * Render the React configuration form
     */
    private renderForm() {
        if (!this.root) {
            this.root = createRoot(this.container);
        }

        if (!this.currentElement || !this.currentSchema) {
            this.root.render(<p>No element selected</p>);
            return;
        }

        this.root.render(
            <ConfigEditor
                element={this.currentElement}
                schema={this.currentSchema}
                onConfigChange={(elementId: string, changes: { [key: string]: any }) => {
                    // Update the local element object
                    Object.assign(this.currentElement, changes);

                    // Call the change callback
                    if (this.changeCallback) {
                        this.changeCallback(elementId, changes);
                    }
                }}
            />
        );
    }

    /**
     * Update the current configuration values
     */
    updateConfig(newConfig: { [key: string]: any }) {
        if (!this.currentElement) return;

        Object.assign(this.currentElement, newConfig);
        this.renderForm();
    }

    /**
     * Cleanup method to unmount React component
     */
    destroy() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }
}

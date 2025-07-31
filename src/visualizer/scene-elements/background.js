// Background element for rendering the main background
import { SceneElement } from './base.js';
import { Rectangle } from '../render-objects/index.js';

export class BackgroundElement extends SceneElement {
    constructor(id = 'background', config = {}) {
        super('background', id, config);
        this.backgroundColor = '#1a1a1a'; // Default dark background
        this._applyConfig();
    }

    static getConfigSchema() {
        return {
            name: 'Background',
            description: 'Solid background color for the visualization',
            category: 'layout',
            properties: {
                ...super.getConfigSchema().properties,
                backgroundColor: {
                    type: 'color',
                    label: 'Background Color',
                    default: '#1a1a1a',
                    description: 'Background color for the visualization'
                }
            }
        };
    }

    _applyConfig() {
        super._applyConfig();
        if (this.config.backgroundColor !== undefined) {
            this.backgroundColor = this.config.backgroundColor;
        }
    }

    buildRenderObjects(config, targetTime) {
        if (!this.visible) return [];

        const { canvas } = config;
        const background = new Rectangle(0, 0, canvas.width, canvas.height, this.backgroundColor);
        return [background];
    }

    setBackgroundColor(color) {
        this.backgroundColor = color;
        return this;
    }
}

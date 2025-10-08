// UI types for configuration and scene editing

export interface ConfigField {
    key: string;
    label: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file' | 'range';
    value: any;
    min?: number;
    max?: number;
    step?: number;
    options?: { value: any; label: string }[];
}

export interface ConfigSection {
    title: string;
    fields: ConfigField[];
}

export interface SceneConfig {
    sections: ConfigSection[];
}

// New property grouping system for After Effects-style UI
export interface PropertyDefinition {
    key: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file' | 'range' | 'font';
    label: string;
    description?: string;
    default?: any;
    min?: number;
    max?: number;
    step?: number;
    options?: { value: any; label: string }[];
    accept?: string;
    requiredFeatureKey?: string;
    autoFeatureLabel?: string;
}

export interface PropertyGroup {
    id: string;
    label: string;
    collapsed: boolean;
    properties: PropertyDefinition[];
}

export interface EnhancedConfigSchema {
    name: string;
    description: string;
    category?: string;
    groups: PropertyGroup[];
}

export interface UIState {
    activeTab: string;
    isLoading: boolean;
    error: string | null;
}

export interface FileUploadConfig {
    accept: string[];
    maxSize: number;
    multiple: boolean;
}

export interface DynamicConfigEditor {
    generateConfigUI(element: any): SceneConfig;
    updateElementConfig(element: any, changes: { [key: string]: any }): void;
}

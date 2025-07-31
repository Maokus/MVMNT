// UI types for configuration and scene editing

export interface ConfigField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'color' | 'select' | 'file' | 'range';
  value: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: any; label: string; }[];
}

export interface ConfigSection {
  title: string;
  fields: ConfigField[];
}

export interface SceneConfig {
  sections: ConfigSection[];
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

export interface SceneBuilder {
  createElement(type: string, config?: any): any;
  removeElement(elementId: string): boolean;
  updateElement(elementId: string, changes: any): boolean;
  getElementList(): any[];
}

export type MacroType =
    | 'number'
    | 'string'
    | 'boolean'
    | 'color'
    | 'select'
    | 'file'
    | 'file-midi'
    | 'file-image'
    | 'font'
    | 'timelineTrackRef';

export interface MacroOptions {
    min?: number;
    max?: number;
    step?: number;
    selectOptions?: { value: any; label: string }[];
    accept?: string;
    allowMultiple?: boolean;
    allowedTrackTypes?: Array<'midi' | 'audio'>;
    [key: string]: any;
}

export interface Macro {
    name: string;
    type: MacroType;
    value: any;
    defaultValue: any;
    options: MacroOptions;
    createdAt: number;
    lastModified: number;
}

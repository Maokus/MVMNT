export interface TemplateManifestEntry {
    id: string;
    name?: string;
    description?: string;
    author?: string;
}

export const easyModeTemplateManifest: TemplateManifestEntry[] = [
    {
        id: 'blank',
        name: 'blank',
        description: 'blank scene',
        author: 'Maokus',
    },
    {
        id: 'default',
        name: 'default',
        description: 'default scene inspired by Kashiwade',
        author: 'Maokus',
    },
    {
        id: 'default_1920x1080',
        name: 'default_1920x1080',
        description: 'default scene but in 1920x1080 (16x9)',
        author: 'Maokus',
    },
];

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
        id: 'electone',
        name: 'electone',
        description: 'Electone scene inspired by Kashiwade',
        author: 'Maokus',
    },
    {
        id: 'electone_1920x1080',
        name: 'electone_1920x1080',
        description: 'Electone scene in 1920x1080 (16x9)',
        author: 'Maokus',
    },
    {
        id: 'electone_1080x1920',
        name: 'electone_1080x1920',
        description: 'Electone scene in 1080x1920 (9x16)',
        author: 'Maokus',
    },
];

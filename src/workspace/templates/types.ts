export interface TemplateMetadata {
    name?: string;
    author?: string;
    description?: string;
}

export interface LoadedTemplateArtifact {
    data: Uint8Array;
    metadata?: TemplateMetadata;
}

export interface TemplateDefinition {
    id: string;
    name: string;
    description: string;
    author?: string;
    loadArtifact: () => Promise<LoadedTemplateArtifact>;
    loadMetadata?: () => Promise<TemplateMetadata | undefined>;
}

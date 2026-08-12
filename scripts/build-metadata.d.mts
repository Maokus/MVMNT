export interface BuildMetadata {
    version: string;
    channel: 'development' | 'nightly' | 'stable';
    commit: string;
    builtAt: string;
}

export function readBuildMetadata(environment?: NodeJS.ProcessEnv): BuildMetadata;
export function buildMetadataDefines(environment?: NodeJS.ProcessEnv): Record<string, string>;

import { extractSceneMetadataFromArtifact } from '@persistence/scene-package';
import { easyModeTemplateManifest, TemplateManifestEntry } from '../../templates/manifest';
import type { LoadedTemplateArtifact, TemplateDefinition } from './types';

const templateFiles = import.meta.glob('../../easymode/templates/*.mvt', {
    query: '?arraybuffer',
    import: 'default',
}) as Record<string, () => Promise<ArrayBuffer | Uint8Array>>;

async function toUint8Array(value: unknown): Promise<Uint8Array> {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
        return new Uint8Array(await value.arrayBuffer());
    }
    if (typeof value === 'string') {
        if (typeof fetch !== 'function') {
            throw new Error('Unable to resolve template asset URL');
        }
        const response = await fetch(value);
        if (!response.ok) {
            throw new Error(`Failed to fetch template asset: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }
    throw new Error('Unsupported template module format');
}

const manifestEntries = easyModeTemplateManifest.reduce<Record<string, TemplateManifestEntry>>((acc, entry) => {
    acc[entry.id] = entry;
    return acc;
}, {});

export const easyModeTemplates: TemplateDefinition[] = Object.entries(templateFiles)
    .map(([path, loader]) => {
        const filename = path.split('/').pop() ?? 'template.mvt';
        const id = filename.replace(/\.mvt$/i, '');
        const fallbackName = id
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase());
        const manifest = manifestEntries[id];
        const name = manifest?.name?.trim() || fallbackName || 'Template';
        const description = manifest?.description?.trim() || 'Ready-made scene configuration.';
        const author = manifest?.author?.trim() || undefined;
        let cachedData: Uint8Array | null = null;
        let cachedMetadata: LoadedTemplateArtifact['metadata'];
        let pendingLoad: Promise<void> | null = null;

        const ensureLoaded = async () => {
            if (cachedData) return;
            if (pendingLoad) {
                await pendingLoad;
                return;
            }
            pendingLoad = (async () => {
                try {
                    const moduleValue = await loader();
                    const data = await toUint8Array(moduleValue);
                    cachedData = data;
                    cachedMetadata = extractSceneMetadataFromArtifact(data);
                } finally {
                    pendingLoad = null;
                }
            })();
            await pendingLoad;
        };

        return {
            id,
            name,
            description,
            author,
            loadArtifact: async () => {
                await ensureLoaded();
                if (!cachedData) {
                    throw new Error('Template data unavailable');
                }
                const cloned = new Uint8Array(cachedData);
                return { data: cloned, metadata: cachedMetadata };
            },
            loadMetadata: async () => {
                try {
                    await ensureLoaded();
                    return cachedMetadata;
                } catch {
                    return undefined;
                }
            },
        } satisfies TemplateDefinition;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

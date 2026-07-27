import { basename, extname, normalize, resolve, sep } from 'node:path';

export const PROJECT_EXTENSION = '.mvt';
export const PLUGIN_EXTENSION = '.mvmnt-plugin';

export function isSupportedOpenPath(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return extname(lower) === PROJECT_EXTENSION || lower.endsWith(PLUGIN_EXTENSION);
}

export function ensureProjectExtension(filePath: string): string {
    return filePath.toLowerCase().endsWith(PROJECT_EXTENSION) ? filePath : `${filePath}${PROJECT_EXTENSION}`;
}

export function sanitizeSuggestedName(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    const cleaned = raw
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\.+$/g, '')
        .slice(0, 120);
    return ensureProjectExtension(cleaned || 'Untitled');
}

export function resolveRendererPath(rendererRoot: string, urlPathname: string): string | null {
    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(urlPathname);
    } catch {
        return null;
    }
    const pathSegments = decodedPath.replace(/\\/g, '/').split('/');
    if (pathSegments.includes('..')) return null;
    const relativePath = normalize(decodedPath).replace(/^[/\\]+/, '');
    const candidate = resolve(rendererRoot, relativePath);
    const isInsideRoot = candidate === rendererRoot || candidate.startsWith(`${rendererRoot}${sep}`);
    if (!isInsideRoot) return null;
    return extname(relativePath) ? candidate : resolve(rendererRoot, 'index.html');
}

export function displayNameForPath(filePath: string): string {
    return basename(filePath);
}

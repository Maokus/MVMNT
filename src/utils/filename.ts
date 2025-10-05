// Utility helpers for export filename normalization & sanitization
// Ensures a provided base name is safe for downloads and has desired extension exactly once.

export function sanitizeBaseFilename(base: string): string {
    return base.replace(/[^a-z0-9_.\-]/gi, '_');
}

export function ensureExtension(base: string, ext: string): string {
    if (!ext.startsWith('.')) ext = '.' + ext;
    const regex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
    return regex.test(base) ? base : base + ext;
}

export function buildExportFilename(
    user: string | undefined,
    sceneName: string | undefined,
    fallback: string,
    ext: string
): string {
    const raw = (user || sceneName || fallback || 'export').trim();
    const ensured = ensureExtension(raw, ext);
    return sanitizeBaseFilename(ensured);
}

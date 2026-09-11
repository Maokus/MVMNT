export const PLUGIN_ID_PATTERN = /^[a-z0-9.-]{3,}$/;

export function isValidPluginId(value) {
    return typeof value === 'string' && PLUGIN_ID_PATTERN.test(value) && !value.startsWith('.') && !value.endsWith('.');
}

export function targetsSdkMajor(value, major) {
    if (typeof value !== 'string' || !Number.isInteger(major) || major < 0) return false;
    const firstVersion = value.trim().match(/^(?:[~^]|>=?|<=?)?\s*v?(\d+)(?:\.(?:\d+|x|\*)){1,2}(?:\s|$)/i);
    return firstVersion !== null && Number(firstVersion[1]) === major;
}

export function targetsSdk2(value) {
    return targetsSdkMajor(value, 2);
}

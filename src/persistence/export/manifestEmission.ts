/** Converts an exact plugin version to the compatible range emitted in scene manifests. */
export function toPluginVersionRange(version: string): string {
    const match = /^(\d+)\.(\d+)\./.exec(version);
    return match ? `^${match[1]}.${match[2]}.0` : version;
}

export function buildCompatibilityWarnings(messages: string[]): { warnings: { message: string }[] } | undefined {
    return messages.length ? { warnings: messages.map((message) => ({ message })) } : undefined;
}

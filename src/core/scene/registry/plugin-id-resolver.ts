type PluginIdResolver = (type: string) => string | undefined;

let resolvePluginId: PluginIdResolver = () => undefined;

export function setSceneElementPluginIdResolver(resolver: PluginIdResolver): void {
    resolvePluginId = resolver;
}

export function getSceneElementPluginId(type: string): string | undefined {
    return resolvePluginId(type);
}

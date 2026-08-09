import type { PluginBuildResult } from './build.mjs';
export function checkPlugin(pluginDirectory: string): Promise<PluginBuildResult & { checkedEntries: number }>;

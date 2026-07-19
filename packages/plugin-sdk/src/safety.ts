import { err, ok, type PluginCapability, type Result } from './api.js';

export function checkCapability(available: readonly PluginCapability[], capability: PluginCapability): Result<true> {
  return available.includes(capability)
    ? ok(true)
    : err({ code: 'CAPABILITY_UNAVAILABLE', message: `Capability '${capability}' is unavailable`, capability });
}

export function limitRenderObjects<T>(objects: readonly T[], maximum: number): readonly T[] {
  return objects.length <= maximum ? objects : objects.slice(0, maximum);
}

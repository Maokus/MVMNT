import { getPluginHostApi } from './get-plugin-host-api';
import type { PluginHostApi, PluginHostCapability } from './plugin-api';
import type { PluginHostApiStatus } from './get-plugin-host-api';

export interface RequiredPluginApiOk {
    ok: true;
    api: PluginHostApi;
}

export interface RequiredPluginApiFailure {
    ok: false;
    api: null;
    status: Exclude<PluginHostApiStatus, 'ok'>;
    missingCapabilities: PluginHostCapability[];
    renderFallback(): never[];
}

export type RequiredPluginApiResult = RequiredPluginApiOk | RequiredPluginApiFailure;

/**
 * Thin wrapper over getPluginHostApi that returns a discriminated union keyed on `ok`.
 *
 * When `ok` is true, `api` is guaranteed non-null and TypeScript narrows accordingly.
 * When `ok` is false, `status` and `missingCapabilities` describe the failure; distinct
 * failure reasons are preserved, not collapsed into a silent default.
 *
 * The element reference is accepted for forward-compatibility (future manifest-driven
 * capability resolution) but is not used in the current implementation.
 *
 * @example
 * const host = getRequiredPluginApi(this, [PLUGIN_CAPABILITIES.audioFeaturesRead]);
 * if (!host.ok) return host.renderFallback();
 * const data = host.api.audio.sampleFeatureAtTime({ ... });
 */
export function getRequiredPluginApi(_element: object, capabilities: PluginHostCapability[]): RequiredPluginApiResult {
    const resolution = getPluginHostApi(capabilities);

    if (resolution.api && resolution.status === 'ok') {
        return { ok: true, api: resolution.api };
    }

    return {
        ok: false,
        api: null,
        status: resolution.status as Exclude<PluginHostApiStatus, 'ok'>,
        missingCapabilities: resolution.missingCapabilities,
        renderFallback() {
            return [];
        },
    };
}

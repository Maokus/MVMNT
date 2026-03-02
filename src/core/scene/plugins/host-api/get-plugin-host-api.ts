import { satisfiesVersion } from '../version-check';
import {
    PLUGIN_API_VERSION,
    type PluginHostApi,
    type PluginHostCapability,
    type PluginHostGlobals,
} from './plugin-api';

export type PluginHostApiStatus = 'ok' | 'missing-host' | 'unsupported-version' | 'missing-capabilities';

export interface PluginHostApiResolution {
    api: PluginHostApi | null;
    status: PluginHostApiStatus;
    missingCapabilities: PluginHostCapability[];
}

function normalizeCapabilities(input: unknown): PluginHostCapability[] {
    if (!Array.isArray(input)) {
        return [];
    }
    return input.filter((value): value is PluginHostCapability => typeof value === 'string');
}

export function getPluginHostApi(
    requiredCapabilities: PluginHostCapability[] = [],
    target: PluginHostGlobals = globalThis as PluginHostGlobals
): PluginHostApiResolution {
    const hostApi = target.MVMNT?.plugins;

    if (!hostApi) {
        return {
            api: null,
            status: 'missing-host',
            missingCapabilities: [...requiredCapabilities],
        };
    }

    if (!satisfiesVersion(hostApi.apiVersion, `^${PLUGIN_API_VERSION}`)) {
        return {
            api: null,
            status: 'unsupported-version',
            missingCapabilities: [...requiredCapabilities],
        };
    }

    const availableCapabilities = normalizeCapabilities(hostApi.capabilities);
    const missingCapabilities = requiredCapabilities.filter((capability) => !availableCapabilities.includes(capability));

    if (missingCapabilities.length > 0) {
        return {
            api: hostApi,
            status: 'missing-capabilities',
            missingCapabilities,
        };
    }

    return {
        api: hostApi,
        status: 'ok',
        missingCapabilities: [],
    };
}

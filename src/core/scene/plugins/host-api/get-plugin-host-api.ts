import { satisfiesVersion } from '../version-check';
import { type PluginHostApi, type PluginHostCapability, type PluginHostGlobals } from './plugin-api';
import { MissingHostError, UnsupportedVersionError, MissingCapabilityError } from '../plugin-errors';
import { PLUGIN_API_VERSION } from '../api-version';

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

/**
 * Type-safe options for getPluginHostApi
 */
export interface GetPluginHostApiOptions {
    capabilities?: PluginHostCapability[];
    throwOnError?: boolean;
    target?: PluginHostGlobals;
}

/**
 * Old pattern overload: returns status-based resolution (default)
 */
export function getPluginHostApi(
    requiredCapabilities?: PluginHostCapability[],
    target?: PluginHostGlobals
): PluginHostApiResolution;

/**
 * New pattern overload: with options object (throwOnError mode)
 */
export function getPluginHostApi(options: GetPluginHostApiOptions & { throwOnError: true }): PluginHostApi;

/**
 * New pattern overload: with options object (status mode, explicit)
 */
export function getPluginHostApi(options: GetPluginHostApiOptions & { throwOnError?: false }): PluginHostApiResolution;

/**
 * New pattern overload: with options object (either mode)
 */
export function getPluginHostApi(options: GetPluginHostApiOptions): PluginHostApiResolution | PluginHostApi;

/**
 * Implementation that handles both patterns
 */
export function getPluginHostApi(
    arg1?: PluginHostCapability[] | GetPluginHostApiOptions,
    arg2?: PluginHostGlobals
): PluginHostApiResolution | PluginHostApi {
    // Parse arguments (support both old and new patterns)
    let requiredCapabilities: PluginHostCapability[] = [];
    let target: PluginHostGlobals = globalThis as PluginHostGlobals;
    let throwOnError = false;

    if (Array.isArray(arg1)) {
        // Old pattern: getPluginHostApi(capabilities[], target?)
        requiredCapabilities = arg1;
        target = arg2 ?? target;
    } else if (arg1 && typeof arg1 === 'object') {
        // New pattern: getPluginHostApi(options)
        const options = arg1 as GetPluginHostApiOptions;
        requiredCapabilities = options.capabilities ?? [];
        target = options.target ?? target;
        throwOnError = options.throwOnError ?? false;
    }

    const hostApi = target.MVMNT?.plugins;

    // Handle missing host
    if (!hostApi) {
        if (throwOnError) {
            throw new MissingHostError();
        }
        return {
            api: null,
            status: 'missing-host',
            missingCapabilities: [...requiredCapabilities],
        };
    }

    // Handle version mismatch
    if (!satisfiesVersion(hostApi.apiVersion, `^${PLUGIN_API_VERSION}`)) {
        if (throwOnError) {
            throw new UnsupportedVersionError(`^${PLUGIN_API_VERSION}`, hostApi.apiVersion);
        }
        return {
            api: null,
            status: 'unsupported-version',
            missingCapabilities: [...requiredCapabilities],
        };
    }

    // Handle missing capabilities
    const availableCapabilities = normalizeCapabilities(hostApi.capabilities);
    const missingCapabilities = requiredCapabilities.filter(
        (capability) => !availableCapabilities.includes(capability)
    );

    if (missingCapabilities.length > 0) {
        if (throwOnError) {
            throw new MissingCapabilityError(missingCapabilities[0]);
        }
        return {
            api: hostApi,
            status: 'missing-capabilities',
            missingCapabilities,
        };
    }

    // Success
    if (throwOnError) {
        return hostApi;
    }
    return {
        api: hostApi,
        status: 'ok',
        missingCapabilities: [],
    };
}

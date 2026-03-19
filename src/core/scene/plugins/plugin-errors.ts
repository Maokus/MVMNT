/**
 * Exception-based error handling for the plugin API.
 *
 * These error classes provide an alternative to the status-based pattern.
 * Use getPluginHostApi({ throwOnError: true }) to enable exception throwing.
 *
 * @example
 *   import { getPluginHostApi, MissingCapabilityError } from '@mvmnt/plugin-sdk';
 *
 *   try {
 *       const api = getPluginHostApi({ throwOnError: true });
 *       const notes = api.timeline.selectNotesInWindow({...});
 *   } catch (e) {
 *       if (e instanceof MissingCapabilityError) {
 *           console.error(`Capability unavailable: ${e.capability}`);
 *       }
 *   }
 */

/**
 * Base error for plugin API issues
 */
export class PluginApiError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PluginApiError';
        Object.setPrototypeOf(this, PluginApiError.prototype);
    }
}

/**
 * Thrown when the plugin API is not installed in the host
 */
export class MissingHostError extends PluginApiError {
    constructor() {
        super('Plugin API host is not available. Ensure the app bootstrap calls installPluginHostApi().');
        this.name = 'MissingHostError';
        Object.setPrototypeOf(this, MissingHostError.prototype);
    }
}

/**
 * Thrown when the plugin API version is incompatible
 */
export class UnsupportedVersionError extends PluginApiError {
    constructor(required: string, available: string) {
        super(
            `Plugin API version mismatch: plugin requires \`${required}\` but host provides \`${available}\`. ` +
            `Upgrade the application or use an older version of the plugin.`
        );
        this.name = 'UnsupportedVersionError';
        Object.setPrototypeOf(this, UnsupportedVersionError.prototype);
    }
}

/**
 * Thrown when a required capability is not available
 */
export class MissingCapabilityError extends PluginApiError {
    constructor(public capability: string) {
        super(
            `Plugin capability "${capability}" is not available on this host. ` +
            `The host may not have the required resources or features enabled for this capability.`
        );
        this.name = 'MissingCapabilityError';
        Object.setPrototypeOf(this, MissingCapabilityError.prototype);
    }
}

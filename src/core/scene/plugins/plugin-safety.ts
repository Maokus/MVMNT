/**
 * Safety controls for plugin element rendering
 * 
 * Prevents:
 * - Excessive render object counts
 * - Runaway render loops (timeouts)
 * - Unauthorized capability usage
 */

export interface PluginSafetyConfig {
    /** Maximum number of render objects a plugin element can produce */
    maxRenderObjectsPerElement: number;
    /** Maximum time (ms) allowed for a single render call */
    maxRenderTimeMs: number;
    /** Whether to enforce capability checks */
    enforceCapabilities: boolean;
}

export const DEFAULT_SAFETY_CONFIG: PluginSafetyConfig = {
    maxRenderObjectsPerElement: 10000,
    maxRenderTimeMs: 100,
    enforceCapabilities: true,
};

/**
 * Wrap a render function with safety limits
 */
export function withRenderSafety<T>(
    fn: () => T,
    config: PluginSafetyConfig = DEFAULT_SAFETY_CONFIG,
    context: { pluginId: string; elementType: string }
): T | null {
    const startTime = performance.now();
    let timeoutId: number | undefined;
    let timedOut = false;

    // Set up timeout to detect hung renders
    if (config.maxRenderTimeMs > 0) {
        timeoutId = window.setTimeout(() => {
            timedOut = true;
            console.error(
                `[PluginSafety] Render timeout for plugin '${context.pluginId}' element '${context.elementType}' ` +
                `(exceeded ${config.maxRenderTimeMs}ms)`
            );
        }, config.maxRenderTimeMs);
    }

    try {
        const result = fn();

        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }

        const elapsed = performance.now() - startTime;
        
        // Log warning if render took significant time (but didn't timeout)
        if (elapsed > config.maxRenderTimeMs * 0.8) {
            console.warn(
                `[PluginSafety] Slow render for plugin '${context.pluginId}' element '${context.elementType}' ` +
                `(${elapsed.toFixed(1)}ms)`
            );
        }

        return result;
    } catch (error) {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }

        console.error(
            `[PluginSafety] Render error for plugin '${context.pluginId}' element '${context.elementType}':`,
            error
        );
        
        return null;
    }
}

/**
 * Validate and limit render object count
 */
export function limitRenderObjects<T extends any[]>(
    objects: T,
    config: PluginSafetyConfig = DEFAULT_SAFETY_CONFIG,
    context: { pluginId: string; elementType: string }
): T {
    if (objects.length > config.maxRenderObjectsPerElement) {
        console.warn(
            `[PluginSafety] Render object limit exceeded for plugin '${context.pluginId}' element '${context.elementType}' ` +
            `(${objects.length} objects, limit is ${config.maxRenderObjectsPerElement}). Truncating.`
        );
        return objects.slice(0, config.maxRenderObjectsPerElement) as T;
    }
    return objects;
}

/**
 * Check if a plugin element has the required capability
 */
export function hasCapability(
    capabilities: string[] | undefined,
    required: string
): boolean {
    if (!capabilities) return false;
    return capabilities.includes(required);
}

/**
 * Validate that an element has required capabilities for an operation
 */
export function checkCapability(
    capabilities: string[] | undefined,
    required: string,
    config: PluginSafetyConfig = DEFAULT_SAFETY_CONFIG,
    context: { pluginId: string; elementType: string }
): boolean {
    if (!config.enforceCapabilities) {
        return true;
    }

    if (!hasCapability(capabilities, required)) {
        console.error(
            `[PluginSafety] Capability '${required}' required but not declared for plugin '${context.pluginId}' ` +
            `element '${context.elementType}'`
        );
        return false;
    }

    return true;
}

/**
 * Error types for plugin safety violations
 */
export enum PluginSafetyError {
    TIMEOUT = 'TIMEOUT',
    RENDER_OBJECT_LIMIT = 'RENDER_OBJECT_LIMIT',
    CAPABILITY_VIOLATION = 'CAPABILITY_VIOLATION',
    UNKNOWN = 'UNKNOWN',
}

/**
 * Get a user-friendly error message for a safety violation
 */
export function getSafetyErrorMessage(errorType: PluginSafetyError): string {
    switch (errorType) {
        case PluginSafetyError.TIMEOUT:
            return 'Plugin element render timed out';
        case PluginSafetyError.RENDER_OBJECT_LIMIT:
            return 'Plugin element exceeded render object limit';
        case PluginSafetyError.CAPABILITY_VIOLATION:
            return 'Plugin element attempted unauthorized operation';
        case PluginSafetyError.UNKNOWN:
        default:
            return 'Plugin element encountered an error';
    }
}

/**
 * Plugin host API: capability system, host API accessor, and error types.
 *
 * @module @mvmnt/plugin-sdk/api
 */

export {
    PLUGIN_CAPABILITIES,
    type PluginHostApi,
    type PluginHostCapability,
    type PluginCapabilityMap,
} from '@core/scene/plugins/host-api/plugin-api';

export { PLUGIN_API_VERSION } from '@core/scene/plugins/api-version';

export {
    getPluginHostApi,
    type PluginHostApiResolution,
    type PluginHostApiStatus,
    type GetPluginHostApiOptions,
} from '@core/scene/plugins/host-api/get-plugin-host-api';

export {
    PluginApiError,
    MissingHostError,
    UnsupportedVersionError,
    MissingCapabilityError,
} from '@core/scene/plugins/plugin-errors';

export {
    getRequiredPluginApi,
    type RequiredPluginApiResult,
    type RequiredPluginApiOk,
    type RequiredPluginApiFailure,
} from '@core/scene/plugins/host-api/required-plugin-api';

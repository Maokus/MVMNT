import {
    ANALYTICS_POLICY_VERSION,
    type AnalyticsEventMap,
    type AnalyticsEventName,
    type AnalyticsProperties,
} from './contracts';

type UnknownProperties = Record<string, unknown>;
type Validator<K extends AnalyticsEventName> = (properties: UnknownProperties) => AnalyticsEventMap[K] | null;
type Validators = { [K in AnalyticsEventName]: Validator<K> };

const entryPoints = new Set(['home', 'menu', 'desktop_menu', 'deep_link', 'drag_drop', 'community']);
const documentSources = new Set([
    'file_picker',
    'browser_file_picker',
    'recent_documents',
    'drag_drop',
    'os_open',
    'community',
]);
const failureCategories = new Set(['cancelled', 'validation', 'import', 'save', 'render', 'output', 'unknown']);
const screens = new Set(['home', 'workspace', 'about', 'privacy', 'changelog', 'community', 'contribute']);
const templateEntryPoints = new Set(['home', 'workspace', 'community']);
const exportFormats = new Set(['video', 'png']);
const exportExecutionModes = new Set(['foreground', 'background', 'automation']);

function hasExactKeys(properties: UnknownProperties, keys: string[]): boolean {
    const actual = Object.keys(properties).sort();
    return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function empty(properties: UnknownProperties): Record<string, never> | null {
    return hasExactKeys(properties, []) ? {} : null;
}

function singleString<K extends string>(key: K, values: Set<string>) {
    return (properties: UnknownProperties): Record<K, string> | null => {
        const value = properties[key];
        return hasExactKeys(properties, [key]) && typeof value === 'string' && values.has(value)
            ? ({ [key]: value } as Record<K, string>)
            : null;
    };
}

function exportBase(
    properties: UnknownProperties
): { export_format: 'video' | 'png'; execution_mode: 'foreground' | 'background' | 'automation' } | null {
    const format = properties.export_format;
    const mode = properties.execution_mode;
    if (
        typeof format !== 'string' ||
        !exportFormats.has(format) ||
        typeof mode !== 'string' ||
        !exportExecutionModes.has(mode)
    ) {
        return null;
    }
    return {
        export_format: format as 'video' | 'png',
        execution_mode: mode as 'foreground' | 'background' | 'automation',
    };
}

const validators: Validators = {
    analytics_consent_granted: (properties) =>
        hasExactKeys(properties, ['policy_version']) && properties.policy_version === ANALYTICS_POLICY_VERSION
            ? { policy_version: ANALYTICS_POLICY_VERSION }
            : null,
    analytics_consent_withdrawn: (properties) =>
        hasExactKeys(properties, ['policy_version']) && properties.policy_version === ANALYTICS_POLICY_VERSION
            ? { policy_version: ANALYTICS_POLICY_VERSION }
            : null,
    app_opened: empty,
    screen_viewed: singleString('screen', screens) as Validator<'screen_viewed'>,
    document_created: singleString('entry_point', entryPoints) as Validator<'document_created'>,
    document_opened: singleString('source', documentSources) as Validator<'document_opened'>,
    document_saved: singleString('save_mode', new Set(['save', 'save_as'])) as Validator<'document_saved'>,
    document_operation_failed: (properties) => {
        const operation = properties.operation;
        const category = properties.failure_category;
        return hasExactKeys(properties, ['operation', 'failure_category']) &&
            (operation === 'open' || operation === 'save') &&
            typeof category === 'string' &&
            failureCategories.has(category)
            ? {
                  operation,
                  failure_category: category as AnalyticsEventMap['document_operation_failed']['failure_category'],
              }
            : null;
    },
    media_imported: singleString(
        'media_type',
        new Set(['midi', 'audio', 'image', 'font'])
    ) as Validator<'media_imported'>,
    scene_element_added: (properties) => {
        const value = properties.element_type;
        return hasExactKeys(properties, ['element_type']) &&
            typeof value === 'string' &&
            /^[a-z][a-z0-9_-]{0,63}$/.test(value)
            ? { element_type: value }
            : null;
    },
    playback_started: empty,
    template_applied: singleString('entry_point', templateEntryPoints) as Validator<'template_applied'>,
    export_started: (properties) => {
        const base = exportBase(properties);
        return base &&
            hasExactKeys(properties, ['export_format', 'includes_audio', 'transparent_background', 'execution_mode']) &&
            typeof properties.includes_audio === 'boolean' &&
            typeof properties.transparent_background === 'boolean'
            ? {
                  ...base,
                  includes_audio: properties.includes_audio,
                  transparent_background: properties.transparent_background,
              }
            : null;
    },
    export_completed: (properties) =>
        hasExactKeys(properties, ['export_format', 'execution_mode']) ? exportBase(properties) : null,
    export_failed: (properties) => {
        const base = exportBase(properties);
        const category = properties.failure_category;
        return base &&
            hasExactKeys(properties, ['export_format', 'execution_mode', 'failure_category']) &&
            typeof category === 'string' &&
            failureCategories.has(category)
            ? { ...base, failure_category: category as AnalyticsEventMap['export_failed']['failure_category'] }
            : null;
    },
    export_cancelled: (properties) =>
        hasExactKeys(properties, ['export_format', 'execution_mode']) ? exportBase(properties) : null,
    community_signup_submitted: empty,
    community_sign_in_completed: empty,
    community_sign_out: empty,
    community_item_downloaded: singleString(
        'item_type',
        new Set(['template', 'plugin'])
    ) as Validator<'community_item_downloaded'>,
    community_template_opened: empty,
    community_plugin_installed: empty,
    community_item_rated: (properties) => {
        const rating = properties.rating;
        return hasExactKeys(properties, ['rating']) &&
            Number.isInteger(rating) &&
            Number(rating) >= 1 &&
            Number(rating) <= 5
            ? { rating: Number(rating) }
            : null;
    },
    community_item_uploaded: singleString(
        'item_type',
        new Set(['template', 'plugin'])
    ) as Validator<'community_item_uploaded'>,
};

export const analyticsEventNames = new Set<AnalyticsEventName>(Object.keys(validators) as AnalyticsEventName[]);

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
    return analyticsEventNames.has(value as AnalyticsEventName);
}

export function validateAnalyticsEvent<K extends AnalyticsEventName>(
    event: K,
    properties: unknown
): AnalyticsEventMap[K] | null {
    if (!isAnalyticsEventName(event)) return null;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
    return validators[event](properties as UnknownProperties);
}

export function toAnalyticsProperties(properties: UnknownProperties): AnalyticsProperties {
    return { ...properties } as AnalyticsProperties;
}

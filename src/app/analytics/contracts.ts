export const ANALYTICS_POLICY_VERSION = '2026-08-17-v1';
export const ANALYTICS_CONSENT_STORAGE_KEY = 'mvmnt.analytics-consent.v1';

export type AnalyticsConsentStatus = 'unknown' | 'granted' | 'denied';

export interface AnalyticsConsentRecord {
    status: Exclude<AnalyticsConsentStatus, 'unknown'>;
    policyVersion: string;
    decidedAt: string;
}

type EmptyProperties = Record<string, never>;
export type EntryPoint = 'home' | 'menu' | 'desktop_menu' | 'deep_link' | 'drag_drop' | 'community';
export type DocumentSource =
    'file_picker' | 'browser_file_picker' | 'recent_documents' | 'drag_drop' | 'os_open' | 'community';
export type MediaType = 'midi' | 'audio' | 'image' | 'font';
export type ItemType = 'template' | 'plugin';
export type ExportFormat = 'video' | 'png';
export type ExportExecutionMode = 'foreground' | 'background' | 'automation';
export type FailureCategory = 'cancelled' | 'validation' | 'import' | 'save' | 'render' | 'output' | 'unknown';
export type TutorialStepName =
    'play' | 'edit_title' | 'import_midi' | 'connect_midi' | 'import_audio' | 'save' | 'render';
export type ExportDurationBucket = 'under_30s' | '30s_2m' | '2m_10m' | 'over_10m' | 'unknown';

export interface AnalyticsEventMap {
    analytics_consent_granted: { policy_version: string };
    analytics_consent_withdrawn: { policy_version: string };
    app_opened: EmptyProperties;
    tutorial_started: EmptyProperties;
    tutorial_step_completed: { step: TutorialStepName };
    tutorial_completed: EmptyProperties;
    tutorial_dismissed: { last_step: TutorialStepName | 'complete' };
    tutorial_failed: { stage: 'setup' };
    screen_viewed: { screen: 'home' | 'workspace' | 'about' | 'privacy' | 'changelog' | 'community' | 'contribute' };
    independent_project_started: { source: 'created' | 'opened' | 'template' };
    document_created: { entry_point: EntryPoint };
    document_opened: { source: DocumentSource };
    document_saved: { save_mode: 'save' | 'save_as' };
    document_operation_failed: { operation: 'open' | 'save'; failure_category: FailureCategory };
    media_imported: { media_type: MediaType };
    media_import_failed: {
        media_type: 'midi' | 'audio';
        failure_category: 'import';
        stage: 'parse' | 'track_add' | 'preflight' | 'decode_or_add';
    };
    scene_element_added: { element_type: string };
    playback_started: EmptyProperties;
    template_applied: { entry_point: 'home' | 'workspace' | 'community' };
    export_started: {
        export_attempt_id: string;
        export_format: ExportFormat;
        includes_audio: boolean;
        transparent_background: boolean;
        execution_mode: ExportExecutionMode;
    };
    export_completed: {
        export_attempt_id: string;
        export_format: ExportFormat;
        execution_mode: ExportExecutionMode;
        duration_bucket: ExportDurationBucket;
    };
    export_failed: {
        export_attempt_id: string;
        export_format: ExportFormat;
        execution_mode: ExportExecutionMode;
        failure_category: FailureCategory;
        duration_bucket: ExportDurationBucket;
    };
    export_cancelled: {
        export_attempt_id: string;
        export_format: ExportFormat;
        execution_mode: ExportExecutionMode;
        duration_bucket: ExportDurationBucket;
    };
    plugin_operation_failed: { operation: 'install' | 'upgrade'; stage: 'download' | 'load' };
    community_signup_submitted: EmptyProperties;
    community_sign_in_completed: EmptyProperties;
    community_sign_out: EmptyProperties;
    community_item_downloaded: { item_type: ItemType };
    community_template_opened: EmptyProperties;
    community_plugin_installed: EmptyProperties;
    community_item_rated: { rating: number };
    community_item_uploaded: { item_type: ItemType };
}

export type AnalyticsEventName = keyof AnalyticsEventMap;
export type AnalyticsPropertyValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

export interface AnalyticsContext {
    app_version: string;
    app_release_line: string;
    build_channel: 'development' | 'nightly' | 'stable';
    build_commit: string;
    runtime: 'desktop' | 'browser';
    platform: 'macos' | 'windows' | 'linux' | 'other';
    consent_policy_version: string;
}

export interface AnalyticsStackFrame {
    filename?: string;
    function?: string;
    lineno?: number;
    colno?: number;
}

export interface AnalyticsExceptionReport {
    type: string;
    level: 'fatal' | 'error';
    fatal: boolean;
    mechanism: 'onerror' | 'onunhandledrejection';
    frames: AnalyticsStackFrame[];
}

export interface AnalyticsDeliveryOptions {
    immediate?: boolean;
}

export interface AnalyticsProvider {
    initialize(context: AnalyticsContext): Promise<void>;
    capture(event: AnalyticsEventName, properties: AnalyticsProperties, options?: AnalyticsDeliveryOptions): void;
    captureException(report: AnalyticsExceptionReport): void;
    identify(accountId: string): void;
    reset(): void;
    setEnabled(enabled: boolean): void;
    getIdentifier(): string | null;
    shutdown(options?: { clearPersistence?: boolean }): void;
}

export type AnalyticsProviderFactory = () => Promise<AnalyticsProvider>;

export interface AnalyticsService {
    initialize(): Promise<boolean>;
    capture<K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]): Promise<void>;
    captureMilestone<K extends AnalyticsEventName>(event: K, properties: AnalyticsEventMap[K]): Promise<void>;
    identify(accountId: string): Promise<void>;
    reset(): void;
    setConsent(status: 'granted' | 'denied'): Promise<void>;
    getConsent(): AnalyticsConsentStatus;
    getIdentifier(): Promise<string | null>;
    subscribeToConsent(listener: () => void): () => void;
}

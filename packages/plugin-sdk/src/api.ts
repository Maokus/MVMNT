export const SDK_VERSION = '2.2.0' as const;

export const PLUGIN_CAPABILITIES = {
    timelineRead: 'timeline.read',
    audioFeaturesRead: 'audio.features.read',
    audioRawRead: 'audio.raw.read',
    timingConversion: 'timing.conversion',
    midiUtils: 'midi.utils',
    audioCalculatorsRegister: 'audio.calculators.register',
} as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[keyof typeof PLUGIN_CAPABILITIES];

export type PluginDiagnosticCode =
    | 'INVALID_ARGUMENT'
    | 'RESOURCE_UNAVAILABLE'
    | 'NOT_FOUND'
    | 'ABORTED'
    | 'CAPABILITY_UNAVAILABLE'
    | 'CONTRACT_VIOLATION'
    | 'INITIALIZATION_FAILED';

export interface PluginDiagnostic {
    readonly code: PluginDiagnosticCode;
    readonly message: string;
    readonly capability?: PluginCapability;
    readonly operation?: string;
    readonly details?: Readonly<Record<string, unknown>>;
}

export type Result<T, E = PluginDiagnostic> =
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });
export const err = (error: PluginDiagnostic): Result<never> =>
    Object.freeze({ ok: false, error: Object.freeze(error) });

export class PluginContractError extends Error {
    readonly code = 'CONTRACT_VIOLATION' as const;
    constructor(message: string) {
        super(message);
        this.name = 'PluginContractError';
    }
}

export interface DiagnosticsApi {
    report(diagnostic: PluginDiagnostic): void;
}

import { describe, expect, it } from 'vitest';
import { getPluginHostApi } from '@core/scene/plugins/host-api/get-plugin-host-api';
import { PLUGIN_API_VERSION, PLUGIN_CAPABILITIES, type PluginHostApi } from '@core/scene/plugins/host-api/plugin-api';

function makeApi(overrides: Partial<PluginHostApi> = {}): PluginHostApi {
    return {
        apiVersion: PLUGIN_API_VERSION,
        capabilities: [PLUGIN_CAPABILITIES.timelineRead, PLUGIN_CAPABILITIES.audioFeaturesRead],
        timeline: {
            getStateSnapshot: () => null,
            selectNotesInWindow: () => [],
            getTrackById: () => null,
            getTracksByIds: () => [],
        },
        audio: {
            sampleFeatureAtTime: () => null,
            sampleFeatureRange: () => [],
        },
        timing: {
            secondsToTicks: () => null,
            ticksToSeconds: () => null,
            secondsToBeats: () => null,
            beatsToSeconds: () => null,
            beatsToTicks: () => 0,
            ticksToBeats: () => 0,
        },
        utilities: {
            midiNoteToName: () => 'C4',
        },
        ...overrides,
    };
}

describe('getPluginHostApi', () => {
    it('returns missing-host when plugin API is not installed', () => {
        const resolution = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead], {});

        expect(resolution.api).toBeNull();
        expect(resolution.status).toBe('missing-host');
        expect(resolution.missingCapabilities).toEqual([PLUGIN_CAPABILITIES.timelineRead]);
    });

    it('returns unsupported-version when host api major version is incompatible', () => {
        const target = {
            MVMNT: {
                plugins: makeApi({ apiVersion: '2.0.0' as typeof PLUGIN_API_VERSION }),
            },
        };

        const resolution = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead], target);

        expect(resolution.api).toBeNull();
        expect(resolution.status).toBe('unsupported-version');
        expect(resolution.missingCapabilities).toEqual([PLUGIN_CAPABILITIES.timelineRead]);
    });

    it('returns missing-capabilities when required capability is unavailable', () => {
        const api = makeApi({ capabilities: [PLUGIN_CAPABILITIES.audioFeaturesRead] });
        const resolution = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead], { MVMNT: { plugins: api } });

        expect(resolution.api).toBe(api);
        expect(resolution.status).toBe('missing-capabilities');
        expect(resolution.missingCapabilities).toEqual([PLUGIN_CAPABILITIES.timelineRead]);
    });

    it('returns ok when required capabilities are available', () => {
        const api = makeApi();
        const resolution = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead], { MVMNT: { plugins: api } });

        expect(resolution.api).toBe(api);
        expect(resolution.status).toBe('ok');
        expect(resolution.missingCapabilities).toEqual([]);
    });
});

import { definePluginElement, type PluginDiagnostic, type Result } from '@mvmnt-app/plugin-sdk';
import { SDK_VERSION, PLUGIN_CAPABILITIES } from '@mvmnt-app/plugin-sdk/api';
import { clamp } from '@mvmnt-app/plugin-sdk/animation';
import {
    getAudioChannelMetadata,
    getAudioRms,
    getRawAudioSamples,
    registerAudioCalculator,
    requireAudioFeatures,
    sampleAudioFeature,
    sampleAudioFeatureRange,
    type AudioApi,
} from '@mvmnt-app/plugin-sdk/audio';
import { Rectangle } from '@mvmnt-app/plugin-sdk/render';
import type { CapabilityContext } from '@mvmnt-app/plugin-sdk/scene';
import { limitRenderObjects } from '@mvmnt-app/plugin-sdk/safety';
import {
    getTimelineMetadata,
    getTimelineSustain,
    getTimelineTrack,
    getTimelineTracks,
    selectTimelineCC,
    selectTimelineNotes,
    type TimelineApi,
} from '@mvmnt-app/plugin-sdk/timeline';
import {
    beatsToSeconds,
    beatsToTicks,
    getTimeSignature,
    secondsToBeats,
    secondsToTicks,
    ticksToBeats,
    ticksToSeconds,
    type TimingApi,
} from '@mvmnt-app/plugin-sdk/timing';
import { midiNoteToName } from '@mvmnt-app/plugin-sdk/utils';
import {
    createProjectAssetHandle,
    loadAsset,
    loadBundledGridAtlas,
    loadBundledImage,
    loadBundledSparrow,
    type AssetApi,
} from '@mvmnt-app/plugin-sdk/visual-assets';

void (null as unknown as
    | AudioApi
    | TimelineApi
    | TimingApi
    | AssetApi
    | CapabilityContext
    | PluginDiagnostic
    | Result<number>);
void SDK_VERSION;
void PLUGIN_CAPABILITIES;
void midiNoteToName(60);
void [
    getAudioChannelMetadata,
    getAudioRms,
    getRawAudioSamples,
    registerAudioCalculator,
    requireAudioFeatures,
    sampleAudioFeature,
    sampleAudioFeatureRange,
    getTimelineMetadata,
    getTimelineSustain,
    getTimelineTrack,
    getTimelineTracks,
    selectTimelineCC,
    selectTimelineNotes,
    beatsToSeconds,
    beatsToTicks,
    getTimeSignature,
    secondsToBeats,
    secondsToTicks,
    ticksToBeats,
    ticksToSeconds,
    createProjectAssetHandle,
    loadAsset,
    loadBundledGridAtlas,
    loadBundledImage,
    loadBundledSparrow,
];

export const sdkV2Fixture = definePluginElement<{ readonly color: string }, undefined>({
    type: 'sdk-v2-fixture',
    metadata: { name: 'SDK 2 Fixture', category: 'Fixtures' },
    schema: { tabs: [] },
    capabilities: {
        required: ['timeline.read'],
        optional: ['audio.features.read'],
    },
    render(props, _state, time, context) {
        const metadata = context.timeline!.getMetadata();
        if (!metadata.ok) return [];
        const size = clamp(20 + time.seconds, 20, 100);
        return limitRenderObjects([new Rectangle(0, 0, size, size, { fillColor: props.color })], 10);
    },
});

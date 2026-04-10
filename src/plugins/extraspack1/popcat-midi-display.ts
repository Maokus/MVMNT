import {
    SceneElement,
    Image,
    Text,
    asNumber,
    asTrimmedString,
    loadBundledAsset,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type PropertyTransform,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema, SceneElementInterface } from '@mvmnt/plugin-sdk';

const normalizeMidiTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

export class PopcatMidiDisplayElement extends SceneElement {
    private _popcat1: HTMLImageElement | null = null;
    private _popcat2: HTMLImageElement | null = null;
    private _assetsLoaded = false;
    private _assetsLoading = false;

    constructor(id: string = 'popcat-midi-display', config: Record<string, unknown> = {}) {
        super('popcat-midi-display', id, config);
    }

    private _loadAssets(): void {
        if (this._assetsLoaded || this._assetsLoading) return;
        this._assetsLoading = true;

        const loadImg = (path: string): Promise<HTMLImageElement> =>
            loadBundledAsset(path).then(
                (url) =>
                    new Promise((resolve, reject) => {
                        const img = new window.Image();
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = url;
                    })
            );

        Promise.all([loadImg('popcat1.tiff'), loadImg('popcat2.tiff')]).then(([img1, img2]) => {
            this._popcat1 = img1;
            this._popcat2 = img2;
            this._assetsLoaded = true;
        });
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');

        return {
            ...base,
            name: 'Popcat Midi Display',
            description: 'Displays popcat reacting to MIDI notes',
            category: 'extraspack1',
            groups: [
                ...basicGroups,
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'midiTrackId',
                            type: 'timelineTrackRef',
                            label: 'MIDI Track',
                            default: null,
                            allowedTrackTypes: ['midi'],
                            description: 'MIDI track to monitor for notes',
                            runtime: { transform: normalizeMidiTrackId, defaultValue: null },
                        },
                    ],
                },
                {
                    id: 'imageSize',
                    label: 'Image Size',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'imageWidth',
                            type: 'number',
                            label: 'Width',
                            default: 200,
                            min: 20,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                        {
                            key: 'imageHeight',
                            type: 'number',
                            label: 'Height',
                            default: 200,
                            min: 20,
                            max: 800,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 200 },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        this._loadAssets();

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        const { api, status, missingCapabilities } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        if (!api || status !== 'ok') {
            const message =
                status === 'unsupported-version'
                    ? 'Plugin API version unsupported'
                    : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
                      ? 'Timeline API unavailable'
                      : 'Plugin host API unavailable';
            return [new Text(0, 0, message, '12px Inter, sans-serif', '#64748b', 'left', 'top')];
        }

        const EPS = 1e-3;
        const activeNotes = api.timeline.selectNotesInWindow({
            trackIds: [props.midiTrackId],
            startSec: targetTime - EPS,
            endSec: targetTime + EPS,
        });

        const isPlaying = activeNotes.length > 0;
        const img = isPlaying ? this._popcat1 : this._popcat2;

        return [
            new Image(0, 0, props.imageWidth, props.imageHeight, img, 1, {
                fitMode: 'contain',
                preserveAspectRatio: true,
            }),
        ];
    }
}

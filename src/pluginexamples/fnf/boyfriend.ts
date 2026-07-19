// @ts-nocheck
import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import { CallbackElementRenderer, prop, insertElementConfig, tab } from '@mvmnt-app/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt-app/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';

const NOTE_ANIMATIONS: Record<number, string> = {
    0: 'BF NOTE LEFT',
    1: 'BF NOTE DOWN',
    2: 'BF NOTE UP',
    3: 'BF NOTE RIGHT',
};
const IDLE_DURATION_SEC = 14 / 24;

class BoyfriendElement extends CallbackElementRenderer {
    private readonly _bundledAtlas = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
    private readonly _media = new VisualMedia(0, 0, 200, 200);
    private readonly _layoutRect = new Rectangle(0, 0, 200, 200, { fillColor: null, strokeColor: null });

    constructor(id: string = 'boyfriend', config: Record<string, unknown> = {}) {
        super('boyfriend', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            { name: 'Boyfriend', description: 'MIDI reactive boyfriend from FNF', category: 'us.maok.fnf' },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'Track to read notes from. note % 4: 0=LEFT, 1=DOWN, 2=UP, 3=RIGHT.',
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'atlasSource',
                        label: 'Sprite',
                        collapsed: false,
                        properties: [
                            prop.number('scale', 'Scale', 1, { min: 0, step: 0.1 }),
                            prop.number('debugOriginX', 'Debug Origin X', 0, { min: 0, max: 1, step: 0.1 }),
                            prop.number('debugOriginY', 'Debug Origin Y', 0, { min: 0, max: 1, step: 0.1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];
        const width = 450;
        const height = 450;
        this._layoutRect.setOrigin(0, 0).setSize(width, height);
        const metadata = this.context.timeline?.getMetadata();
        const bpm = metadata?.ok ? metadata.value.tempoBpm : 120;
        const trackId = props.midiTrackId as string | null;
        const selected = trackId
            ? this.context.timeline?.selectNotes({
                      trackIds: [trackId],
                      startSeconds: targetTime - 8,
                      endSeconds: targetTime + 0.05,
                  })
            : undefined;
        const notes = selected?.ok ? selected.value : [];
        const active = notes.find((note) => note.startSeconds <= targetTime && targetTime < note.endSeconds);
        const animation = active ? (NOTE_ANIMATIONS[active.note % 4] ?? 'BF NOTE LEFT') : 'BF idle dance';
        const localTime = active
            ? targetTime - active.startSeconds
            : ((targetTime % (60 / bpm)) / (60 / bpm)) * IDLE_DURATION_SEC;
        const { resource, status: resourceStatus } = this._bundledAtlas.get();
        this._media
            .setResource(resource, resourceStatus)
            .setAnimation(animation)
            .setLocalTime(localTime)
            .setFitMode('clip')
            .setLayoutParticipation('exclude')
            .setDimensions(width, height)
            .setOriginFraction(props.debugOriginX, props.debugOriginY)
            .setFramePlacement('bottom-center')
            .setScale(props.scale);
        return [this._layoutRect, this._media];
    }
}

export const boyfriend = defineRendererElement(
    { type: 'boyfriend', capabilities: { required: ['timeline.read'], optional: [] } },
    BoyfriendElement
);
export default boyfriend;

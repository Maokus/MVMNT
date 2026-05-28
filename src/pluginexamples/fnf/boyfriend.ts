import { SceneElement, prop, insertElementConfig, tab, getPluginHostApi, PLUGIN_CAPABILITIES } from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// Implemented these to test the sparrow and grid atlas loading systems.
// System itself is still kind of janky but usable. If you know how to make it better
// Message me on discord please 🙏 I have 0 experience with this sort of thing

// FNF note lane: MIDI note % 4 → animation name
// 0 = LEFT (purple), 1 = DOWN (blue), 2 = UP (green), 3 = RIGHT (red)
const NOTE_ANIMATIONS: Record<number, string> = {
    0: 'BF NOTE LEFT',
    1: 'BF NOTE DOWN',
    2: 'BF NOTE UP',
    3: 'BF NOTE RIGHT',
};

// BF idle dance has 14 frames. Beat-sync by resetting localTime each beat.
// Tune this fps to match your atlas's idle animation speed.
const IDLE_FPS = 24;
const IDLE_FRAMES = 14;
const IDLE_DURATION_SEC = IDLE_FRAMES / IDLE_FPS; // ~0.583s

export class BoyfriendElement extends SceneElement {
    private readonly _bundledAtlas = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
    private readonly _media = new VisualMedia(0, 0, 200, 200, { layoutBoundsMode: 'none' });
    private readonly _layoutRect = new Rectangle(0, 0, 200, 200, null, null);

    constructor(id: string = 'boyfriend', config: Record<string, unknown> = {}) {
        super('boyfriend', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Boyfriend',
                description: 'MIDI reactive boyfriend from FNF',
                category: 'us.maok.fnf',
            },
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

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        const WIDTH = 450;
        const HEIGHT = 450;

        if (!props.visible) return [];

        this._layoutRect.width = WIDTH;
        this._layoutRect.height = HEIGHT;
        this._layoutRect.pivotX = 0;
        this._layoutRect.pivotY = 0;

        // Resolve timeline API for note queries and BPM.
        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);

        const timelineState = status === 'ok' ? api?.timeline.getStateSnapshot() : null;
        const bpm = timelineState?.timeline.globalBpm ?? 120;
        const beatSec = 60 / bpm;
        const minNoteLength = 0.5;

        let animationName = 'BF idle dance';
        let localTime: number;

        const trackId = props.midiTrackId as string | null;
        if (trackId && api && status === 'ok') {
            // Look back up to 8s to catch long held notes that started before this window.
            const notes = api.timeline.selectNotesInWindow({
                trackIds: [trackId],
                startSec: targetTime - 8,
                endSec: targetTime + 0.05,
            });

            let activeNote = notes.find((n) => n.startTime <= targetTime && targetTime < n.endTime);
            if (!activeNote) {
                notes.find((n) => n.startTime > targetTime - minNoteLength && n.endTime < targetTime);
            }

            if (activeNote) {
                animationName = NOTE_ANIMATIONS[activeNote.note % 4] ?? 'BF NOTE LEFT';
                // Play note animation from the moment it started.
                localTime = targetTime - activeNote.startTime;
            } else {
                // Idle: sync animation phase to current beat.
                localTime = ((targetTime % beatSec) / beatSec) * IDLE_DURATION_SEC;
            }
        } else {
            // No track selected — idle synced to beat.
            localTime = ((targetTime % beatSec) / beatSec) * IDLE_DURATION_SEC;
        }

        // Use bundled atlas.
        const { resource, status: resStatus } = this._bundledAtlas.get();

        this._media
            .setResource(resource, resStatus)
            .setAnimation(animationName)
            .setLocalTime(localTime)
            .setFitMode('clip')
            .setLayoutBoundsMode('none')
            .setDimensions(WIDTH, HEIGHT)
            .setOriginFraction(props.debugOriginX, props.debugOriginY)
            .setFramePlacement('bottom-center');

        this._media.scaleX = props.scale;
        this._media.scaleY = props.scale;

        return [this._layoutRect, this._media];
    }
}

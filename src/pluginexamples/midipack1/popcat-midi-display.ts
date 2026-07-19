// @ts-nocheck
import { defineRendererElement } from '@mvmnt-app/plugin-sdk';
import {
    CallbackElementRenderer,
    parseFontSelection,
    ensureFontLoaded,
    prop,
    insertElementConfig,
    tab,
} from '@mvmnt-app/plugin-sdk';

import { VisualMedia, Text, Rectangle, type RenderObject } from '@mvmnt-app/plugin-sdk/render';

import type { EnhancedConfigSchema } from '@mvmnt-app/plugin-sdk';

const ANIM_DURATION_MS = 100;
const JUMP_OFFSET_PX = 20;
const BUMP_SCALE_ADD = 0.15;

class PopcatMidiDisplayElement extends CallbackElementRenderer {
    // Bundled defaults
    private readonly _popcat1 = this.bundledSprite('popcat1.png');
    private readonly _popcat2 = this.bundledSprite('popcat2.png');

    // User-override handles (idle = popcat2 / closed mouth, active = popcat1 / open mouth)
    private readonly _idleHandle = this.visualHandle();
    private readonly _activeHandle = this.visualHandle();

    constructor(id: string = 'popcat-midi-display', config: Record<string, unknown> = {}) {
        super('popcat-midi-display', id, config);
    }

    protected override onDestroy(): void {
        this._popcat1.destroy();
        this._popcat2.destroy();
        this._idleHandle.destroy();
        this._activeHandle.destroy();
        super.onDestroy();
    }

    private _applyAnimation(
        playAnimation: 'jump' | 'bump' | 'none',
        elapsedMs: number,
        baseWidth: number,
        baseHeight: number
    ): { x: number; y: number; w: number; h: number } {
        const progress = Math.min(elapsedMs / ANIM_DURATION_MS, 1);
        const animValue = 1 - Math.pow(progress, 3);

        if (playAnimation === 'jump') {
            return { x: 0, y: -JUMP_OFFSET_PX * animValue, w: baseWidth, h: baseHeight };
        } else if (playAnimation === 'bump') {
            const scale = 1 + BUMP_SCALE_ADD * animValue;
            const w = baseWidth * scale;
            const h = baseHeight * scale;
            return { x: -(w - baseWidth) / 2, y: -(h - baseHeight) / 2, w, h };
        }
        return { x: 0, y: 0, w: baseWidth, h: baseHeight };
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Popcat Midi Display',
                description: 'Displays popcat reacting to MIDI notes',
            },
            [
                tab.content([
                    {
                        id: 'midiSource',
                        label: 'MIDI Source',
                        collapsed: false,
                        properties: [
                            prop.midiTrack('midiTrackId', 'MIDI Track', {
                                description: 'MIDI track to monitor for notes',
                            }),
                        ],
                    },
                    {
                        id: 'noteFilter',
                        label: 'Note Filter',
                        collapsed: false,
                        properties: [
                            prop.boolean('manyCats', 'Many Cats', true, {
                                description: 'Display a grid of cats, one per distinct note in the track',
                            }),
                            prop.number('noteSelect', 'Note Select', 0, {
                                min: 0,
                                max: 127,
                                step: 1,
                                description: 'Only activate on this MIDI note (0 = any note)',
                                visibleWhen: [{ key: 'manyCats', falsy: true }],
                            }),
                            prop.number('offset', 'Offset', 0, {
                                min: 0,
                                max: 127,
                                step: 1,
                                description:
                                    'Skip this many of the lowest notes before placing cats (0 = start from the lowest note)',
                                visibleWhen: [{ key: 'manyCats', truthy: true }],
                            }),
                            prop.number('numCats', 'Num Cats', 128, {
                                min: 1,
                                max: 128,
                                step: 1,
                                description: 'Maximum number of cats to display',
                                visibleWhen: [{ key: 'manyCats', truthy: true }],
                            }),
                            prop.number('numRows', 'Num Rows', 3, {
                                step: 1,
                                description:
                                    'Number of rows to distribute cats across. Notes fill left to right, bottom to top.',
                                visibleWhen: [{ key: 'manyCats', truthy: true }],
                            }),
                            prop.number('xSpacing', 'X Spacing', 8, {
                                step: 1,
                                description: 'Horizontal gap in pixels between cats',
                                visibleWhen: [{ key: 'manyCats', truthy: true }],
                            }),
                            prop.number('ySpacing', 'Y Spacing', 8, {
                                step: 1,
                                description: 'Vertical gap in pixels between rows',
                                visibleWhen: [{ key: 'manyCats', truthy: true }],
                            }),
                            prop.boolean('noteLabels', 'Note Labels', false, {
                                description: 'Show MIDI note names below each cat',
                                visibleWhen: [{ key: 'manyCats', truthy: true }],
                            }),
                            prop.font('labelFontFamily', 'Label Font', 'Inter', {
                                description: 'Font family for note name labels (Google Fonts supported).',
                                visibleWhen: [
                                    { key: 'manyCats', truthy: true },
                                    { key: 'noteLabels', truthy: true },
                                ],
                            }),
                        ],
                    },
                ]),
                tab.appearance([
                    {
                        id: 'sprites',
                        label: 'Sprites',
                        collapsed: false,
                        properties: [
                            prop.imageAsset('idleSprite', 'Idle Sprite', {
                                description: 'Image shown when no note is playing. Defaults to popcat2.',
                            }),
                            prop.imageAsset('activeSprite', 'Active Sprite', {
                                description: 'Image shown when a note is playing. Defaults to popcat1.',
                            }),
                        ],
                    },
                    {
                        id: 'animation',
                        label: 'Animation',
                        collapsed: false,
                        properties: [
                            prop.select(
                                'playAnimation',
                                'Play Animation',
                                'jump',
                                [
                                    { value: 'none', label: 'None' },
                                    { value: 'jump', label: 'Jump' },
                                    { value: 'bump', label: 'Bump' },
                                ],
                                { description: 'Animation triggered when a note starts playing' }
                            ),
                        ],
                    },
                    {
                        id: 'imageSize',
                        label: 'Image Size',
                        collapsed: false,
                        properties: [
                            prop.number('imageWidth', 'Width', 200, { step: 1 }),
                            prop.number('imageHeight', 'Height', 200, { step: 1 }),
                        ],
                    },
                ]),
            ]
        );
    }

    override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        if (!props.midiTrackId) {
            return [new Text(0, 0, 'Select a MIDI track', '14px Inter, sans-serif', '#94a3b8', 'left', 'top')];
        }

        const timeline = this.context.timeline;
        if (!timeline) {
            return [new Text(0, 0, 'Timeline API unavailable', '12px Inter, sans-serif', '#64748b', 'left', 'top')];
        }

        const manyCats = props.manyCats as boolean;
        const playAnimation = props.playAnimation as 'jump' | 'bump' | 'none';
        const baseWidth = props.imageWidth as number;
        const baseHeight = props.imageHeight as number;

        // Resolve idle/active sources: user override takes precedence over bundled defaults
        const userIdleSrc = (props.idleSprite as string | null) ?? null;
        const userActiveSrc = (props.activeSprite as string | null) ?? null;

        const { resource: userIdle, status: userIdleStatus } = this._idleHandle.update(userIdleSrc);
        const { resource: userActive, status: userActiveStatus } = this._activeHandle.update(userActiveSrc);
        const { resource: bundledIdle, status: bundledIdleStatus } = this._popcat2.get();
        const { resource: bundledActive, status: bundledActiveStatus } = this._popcat1.get();

        const idleResource = userIdleSrc ? userIdle : bundledIdle;
        const idleStatus = userIdleSrc ? userIdleStatus : bundledIdleStatus;
        const activeResource = userActiveSrc ? userActive : bundledActive;
        const activeStatus = userActiveSrc ? userActiveStatus : bundledActiveStatus;

        const makeVisualMedia = (x: number, y: number, w: number, h: number, isActive: boolean): VisualMedia => {
            const vm = new VisualMedia(x, y, w, h, { fitMode: 'contain' }).setLayoutParticipation('exclude');
            vm.setResource(isActive ? activeResource : idleResource, isActive ? activeStatus : idleStatus);
            return vm;
        };

        // ── Many cats: grid layout, one cat per distinct pitch ──────────────────
        if (manyCats) {
            const offset = props.offset as number;
            const numCats = props.numCats as number;
            const numRows = Math.max(1, Math.round(props.numRows as number));
            const xSpacing = props.xSpacing as number;
            const ySpacing = props.ySpacing as number;
            const noteLabels = props.noteLabels as boolean;
            const labelFontFamilyRaw = (props.labelFontFamily as string | null) ?? 'Inter';

            // Font setup for labels
            let labelFontString = '';
            if (noteLabels) {
                const { family: fontFamily, weight: weightPart } = parseFontSelection(labelFontFamilyRaw);
                const fontWeight = (weightPart || '400').toString();
                const fontSize = Math.max(8, Math.round(baseWidth * 0.15));
                if (fontFamily) ensureFontLoaded(fontFamily, fontWeight);
                labelFontString = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
            }

            const metadata = timeline.getMetadata();
            const allNotes = timeline.selectNotes({
                trackIds: [props.midiTrackId],
                startSeconds: 0,
                endSeconds: metadata.ok ? metadata.value.durationSeconds : 86400,
            });
            const allPitches = allNotes.ok
                ? [...new Set(allNotes.value.map((note) => note.note))].sort((a, b) => a - b)
                : [];

            // Apply offset and numCats limit
            const totalCats = Math.min(numCats, Math.max(0, allPitches.length - offset));
            const catsToShow = allPitches.slice(offset, offset + totalCats);

            if (catsToShow.length === 0) {
                return [new Text(0, 0, 'No notes in range', '12px Inter, sans-serif', '#64748b', 'left', 'top')];
            }

            // Distribute cats evenly across rows, bottom rows get extras
            // Row 0 = bottom, row numRows-1 = top
            const rowCounts: number[] = [];
            const base = Math.floor(catsToShow.length / numRows);
            const extra = catsToShow.length % numRows;
            for (let r = 0; r < numRows; r++) {
                rowCounts.push(base + (r < extra ? 1 : 0));
            }

            const slotWidth = baseWidth + xSpacing;
            const slotHeight = baseHeight + ySpacing;
            const maxCatsInARow = Math.max(...rowCounts);
            const totalWidth = maxCatsInARow * slotWidth - xSpacing;
            const totalHeight = numRows * slotHeight - ySpacing;
            const padding = 20;

            const activeNoteStartMap = new Map<number, number>(); // pitch → startTime (scene seconds)
            // Query a wider window to catch notes that are currently playing.
            // We'll filter to only notes that actually overlap targetTime.
            const lookbackWindow = 10; // seconds — look back up to 10s for long note durations
            const selected = timeline.selectNotes({
                trackIds: [props.midiTrackId],
                startSeconds: targetTime - lookbackWindow,
                endSeconds: targetTime + 0.1,
            });
            const notes = selected.ok ? selected.value : [];
            for (const n of notes) {
                // Only include notes that are actually playing at targetTime
                if (n.startSeconds <= targetTime && targetTime < n.endSeconds) {
                    const prev = activeNoteStartMap.get(n.note);
                    if (prev === undefined || n.startSeconds > prev) activeNoteStartMap.set(n.note, n.startSeconds);
                }
            }

            const objects: RenderObject[] = [
                new Rectangle(
                    -totalWidth / 2 - padding,
                    -totalHeight / 2 - padding,
                    totalWidth + 2 * padding,
                    totalHeight + 2 * padding,
                    null,
                    'transparent',
                    1
                ),
            ];

            let catIndex = 0;
            for (let row = 0; row < numRows; row++) {
                const count = rowCounts[row];
                // Center each row horizontally
                const rowWidth = count * slotWidth - xSpacing;
                const rowOriginX = -rowWidth / 2;
                // Row 0 = bottom: highest y in screen coords (y increases downward)
                const rowCenterY = ((numRows - 1) / 2 - row) * slotHeight;

                for (let col = 0; col < count; col++) {
                    const pitch = catsToShow[catIndex++];
                    const noteStart = activeNoteStartMap.get(pitch);
                    const isActive = noteStart !== undefined;
                    const elapsedMs = isActive ? Math.max(0, (targetTime - noteStart!) * 1000) : 0;

                    const {
                        x: ax,
                        y: ay,
                        w: aw,
                        h: ah,
                    } = isActive
                        ? this._applyAnimation(playAnimation, elapsedMs, baseWidth, baseHeight)
                        : { x: 0, y: 0, w: baseWidth, h: baseHeight };

                    const slotCenterX = rowOriginX + col * slotWidth + baseWidth / 2;
                    const imgX = slotCenterX - baseWidth / 2 + ax;
                    const imgY = rowCenterY - baseHeight / 2 + ay;

                    objects.push(makeVisualMedia(imgX, imgY, aw, ah, isActive));

                    if (noteLabels && labelFontString) {
                        const noteName = this.context.midi?.noteName(pitch) ?? String(pitch);
                        const labelX = slotCenterX;
                        const labelY = rowCenterY + baseHeight / 2 + 4;
                        objects.push(new Text(labelX, labelY, noteName, labelFontString, '#94a3b8', 'center', 'top'));
                    }
                }
            }

            return objects;
        } else {
            // ── Single cat ────────────────────────────────────────────────────────
            const noteSelect = props.noteSelect as number;

            // Query a wider window to catch notes that are currently playing
            const lookbackWindow = 10; // seconds — look back up to 10s for long note durations
            const selected = timeline.selectNotes({
                    trackIds: [props.midiTrackId],
                    startSeconds: targetTime - lookbackWindow,
                    endSeconds: targetTime + 0.1,
                });
            let activeNotes = (selected.ok ? selected.value : []).filter(
                (n) => n.startSeconds <= targetTime && targetTime < n.endSeconds
            );

            if (noteSelect !== 0) {
                activeNotes = activeNotes.filter((n) => n.note === noteSelect);
            }

            const isPlaying = activeNotes.length > 0;
            const elapsedMs = isPlaying ? Math.max(0, (targetTime - activeNotes[0].startSeconds) * 1000) : 0;

            const {
                x: imgX,
                y: imgY,
                w: imgW,
                h: imgH,
            } = isPlaying
                ? this._applyAnimation(playAnimation, elapsedMs, baseWidth, baseHeight)
                : { x: 0, y: 0, w: baseWidth, h: baseHeight };

            return [
                new Rectangle(0, 0, baseWidth, baseHeight, null, 'transparent', 1),
                makeVisualMedia(imgX, imgY, imgW, imgH, isPlaying),
            ];
        }
    }
}

export const popcatMidiDisplay = defineRendererElement(
    { type: 'popcat-midi-display', capabilities: { required: ['timeline.read'], optional: [] } },
    PopcatMidiDisplayElement
);
export default popcatMidiDisplay;

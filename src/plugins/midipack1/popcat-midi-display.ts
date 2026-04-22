import {
    SceneElement,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    parseFontSelection,
    ensureFontLoaded,
    prop,
    insertElementGroups,
} from '@mvmnt/plugin-sdk';

import {
    VisualMedia,
    Text,
    Rectangle,
    type RenderObject
} from '@mvmnt/plugin-sdk/render'

import { visualAssetStore, makeImageKey } from '@core/resources/visual-asset-store';

import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

const normalizeImageSource = (value: unknown): string | File | null => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (value instanceof File) return value;
    return null;
};

const ANIM_DURATION_MS = 100;
const JUMP_OFFSET_PX = 20;
const BUMP_SCALE_ADD = 0.15;

export class PopcatMidiDisplayElement extends SceneElement {
    private _popcat1Url: string | null = null;
    private _popcat2Url: string | null = null;
    private _bundledLoading = false;

    private _currentIdleSource: string | File | null = null;
    private _currentActiveSource: string | File | null = null;

    constructor(id: string = 'popcat-midi-display', config: Record<string, unknown> = {}) {
        super('popcat-midi-display', id, config);
    }

    private _loadBundledAssets(): void {
        if (this._bundledLoading || (this._popcat1Url && this._popcat2Url)) return;
        this._bundledLoading = true;

        Promise.all([
            this.loadBundledAsset('popcat1.png'),
            this.loadBundledAsset('popcat2.png'),
        ]).then(([url1, url2]) => {
            this._popcat1Url = url1;
            this._popcat2Url = url2;
            visualAssetStore.load(url1);
            visualAssetStore.load(url2);
            this._bundledLoading = false;
        }).catch((err) => {
            console.error('[PopcatMidiDisplay] Failed to load assets:', err);
            this._bundledLoading = false;
        });
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
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Popcat Midi Display',
            description: 'Displays popcat reacting to MIDI notes',
        }, [
            {
                id: 'midiSource',
                label: 'MIDI Source',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.midiTrack('midiTrackId', 'MIDI Track', { description: 'MIDI track to monitor for notes' }),
                ],
            },
            {
                id: 'noteFilter',
                label: 'Note Filter',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.boolean('manyCats', 'Many Cats', true, {
                        description: 'Display a grid of cats, one per distinct note in the track',
                    }),
                    prop.number('noteSelect', 'Note Select', 0, {
                        min: 0, max: 127, step: 1,
                        description: 'Only activate on this MIDI note (0 = any note)',
                        visibleWhen: [{ key: 'manyCats', falsy: true }],
                    }),
                    prop.number('offset', 'Offset', 0, {
                        min: 0, max: 127, step: 1,
                        description: 'Skip this many of the lowest notes before placing cats (0 = start from the lowest note)',
                        visibleWhen: [{ key: 'manyCats', truthy: true }],
                    }),
                    prop.number('numCats', 'Num Cats', 128, {
                        min: 1, max: 128, step: 1,
                        description: 'Maximum number of cats to display',
                        visibleWhen: [{ key: 'manyCats', truthy: true }],
                    }),
                    prop.number('numRows', 'Num Rows', 3, {
                        step: 1,
                        description: 'Number of rows to distribute cats across. Notes fill left to right, bottom to top.',
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
                        visibleWhen: [{ key: 'manyCats', truthy: true }, { key: 'noteLabels', truthy: true }],
                    }),
                ],
            },
            {
                id: 'sprites',
                label: 'Sprites',
                variant: 'basic',
                collapsed: false,
                properties: [
                    {
                        key: 'idleSprite',
                        type: 'file',
                        label: 'Idle Sprite',
                        default: null,
                        accept: 'image/*',
                        description: 'Image shown when no note is playing. Defaults to popcat2.',
                        runtime: { transform: normalizeImageSource, defaultValue: null },
                    },
                    {
                        key: 'activeSprite',
                        type: 'file',
                        label: 'Active Sprite',
                        default: null,
                        accept: 'image/*',
                        description: 'Image shown when a note is playing. Defaults to popcat1.',
                        runtime: { transform: normalizeImageSource, defaultValue: null },
                    },
                ],
            },
            {
                id: 'animation',
                label: 'Animation',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.select('playAnimation', 'Play Animation', 'jump', [
                        { value: 'none', label: 'None' },
                        { value: 'jump', label: 'Jump' },
                        { value: 'bump', label: 'Bump' },
                    ], { description: 'Animation triggered when a note starts playing' }),
                ],
            },
            {
                id: 'imageSize',
                label: 'Image Size',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.number('imageWidth', 'Width', 200, { step: 1 }),
                    prop.number('imageHeight', 'Height', 200, { step: 1 }),
                ],
            },
        ]);
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        this._loadBundledAssets();

        // Handle user sprite changes — load into asset store when source changes
        const newIdleSrc = (props.idleSprite as string | File | null) ?? null;
        const newActiveSrc = (props.activeSprite as string | File | null) ?? null;

        if (newIdleSrc !== this._currentIdleSource) {
            this._currentIdleSource = newIdleSrc;
            if (newIdleSrc) visualAssetStore.load(newIdleSrc);
        }
        if (newActiveSrc !== this._currentActiveSource) {
            this._currentActiveSource = newActiveSrc;
            if (newActiveSrc) visualAssetStore.load(newActiveSrc);
        }

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

        const manyCats = props.manyCats as boolean;
        const playAnimation = props.playAnimation as 'jump' | 'bump' | 'none';
        const baseWidth = props.imageWidth as number;
        const baseHeight = props.imageHeight as number;

        // Resolve idle/active asset sources (user override or bundled defaults)
        const idleSrc = this._currentIdleSource ?? this._popcat2Url;
        const activeSrc = this._currentActiveSource ?? this._popcat1Url;
        const idleAsset = idleSrc ? visualAssetStore.get(makeImageKey(idleSrc)) : undefined;
        const activeAsset = activeSrc ? visualAssetStore.get(makeImageKey(activeSrc)) : undefined;

        const makeVisualMedia = (x: number, y: number, w: number, h: number, isActive: boolean): VisualMedia => {
            const src = isActive ? activeSrc : idleSrc;
            const asset = isActive ? activeAsset : idleAsset;
            const vm = new VisualMedia(x, y, w, h);
            vm.setAsset(asset ?? null, asset?.status ?? (src ? 'loading' : 'idle'))
              .setFitMode('contain')
              .setPreserveAspectRatio(true)
              .setIncludeInLayoutBounds(false);
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

            const allPitches = api.timeline.selectDistinctNoteNumbers({ trackIds: [props.midiTrackId] });

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
            const notes = api.timeline.selectNotesInWindow({
                trackIds: [props.midiTrackId],
                startSec: targetTime - lookbackWindow,
                endSec: targetTime + 0.1
            });
            for (const n of notes) {
                // Only include notes that are actually playing at targetTime
                if (n.startTime <= targetTime && targetTime < n.endTime) {
                    const prev = activeNoteStartMap.get(n.note);
                    if (prev === undefined || n.startTime > prev) activeNoteStartMap.set(n.note, n.startTime);
                }
            }

            const objects: RenderObject[] = [
                new Rectangle(
                    -totalWidth / 2 - padding,
                    -totalHeight / 2 - padding,
                    totalWidth + 2 * padding,
                    totalHeight + 2 * padding,
                    null, 'transparent', 1
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

                    const { x: ax, y: ay, w: aw, h: ah } = isActive
                        ? this._applyAnimation(playAnimation, elapsedMs, baseWidth, baseHeight)
                        : { x: 0, y: 0, w: baseWidth, h: baseHeight };

                    const slotCenterX = rowOriginX + col * slotWidth + baseWidth / 2;
                    const imgX = slotCenterX - baseWidth / 2 + ax;
                    const imgY = rowCenterY - baseHeight / 2 + ay;

                    objects.push(makeVisualMedia(imgX, imgY, aw, ah, isActive));

                    if (noteLabels && labelFontString) {
                        const noteName = api.utilities.midiNoteToName(pitch);
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
            let activeNotes = api.timeline.selectNotesInWindow({
                trackIds: [props.midiTrackId],
                startSec: targetTime - lookbackWindow,
                endSec: targetTime + 0.1,
            }).filter((n) => n.startTime <= targetTime && targetTime < n.endTime);

            if (noteSelect !== 0) {
                activeNotes = activeNotes.filter((n) => n.note === noteSelect);
            }

            const isPlaying = activeNotes.length > 0;
            const elapsedMs = isPlaying ? Math.max(0, (targetTime - activeNotes[0].startTime) * 1000) : 0;

            const { x: imgX, y: imgY, w: imgW, h: imgH } = isPlaying
                ? this._applyAnimation(playAnimation, elapsedMs, baseWidth, baseHeight)
                : { x: 0, y: 0, w: baseWidth, h: baseHeight };

            return [
                new Rectangle(0, 0, baseWidth, baseHeight, null, 'transparent', 1),
                makeVisualMedia(imgX, imgY, imgW, imgH, isPlaying),
            ];
        }
    }
}

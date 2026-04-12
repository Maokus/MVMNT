import {
    SceneElement,
    Image,
    Text,
    Rectangle,
    asNumber,
    asBoolean,
    asTrimmedString,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    parseFontSelection,
    ensureFontLoaded,
    type PropertyTransform,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema, SceneElementInterface } from '@mvmnt/plugin-sdk';

const normalizeMidiTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

const normalizeImageSource: PropertyTransform<string | File | null, SceneElementInterface> = (value) => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    if (value instanceof File) return value;
    return null;
};

const normalizePlayAnimation: PropertyTransform<'jump' | 'bump' | 'none', SceneElementInterface> = (
    value,
    element
) => {
    const str = asTrimmedString(value, element)?.toLowerCase();
    if (str === 'jump' || str === 'bump' || str === 'none') return str as 'jump' | 'bump' | 'none';
    return 'none';
};

const ANIM_DURATION_MS = 100;
const JUMP_OFFSET_PX = 20;
const BUMP_SCALE_ADD = 0.15;

export class PopcatMidiDisplayElement extends SceneElement {
    private _popcat1: HTMLImageElement | null = null;
    private _popcat2: HTMLImageElement | null = null;
    private _assetsLoaded = false;
    private _assetsLoading = false;

    private _idleImg: HTMLImageElement | null = null;
    private _activeImg: HTMLImageElement | null = null;
    private _currentIdleSource: string | File | null = null;
    private _currentActiveSource: string | File | null = null;

    // Single-cat animation state
    private _wasPlaying = false;
    private _animStartTime = -Infinity;

    // Per-pitch animation state for many-cats mode
    private _catWasPlaying = new Map<number, boolean>();
    private _catAnimStartTime = new Map<number, number>();

    constructor(id: string = 'popcat-midi-display', config: Record<string, unknown> = {}) {
        super('popcat-midi-display', id, config);
    }

    private _loadAssets(): void {
        if (this._assetsLoaded || this._assetsLoading) return;
        this._assetsLoading = true;

        const loadImg = (path: string): Promise<HTMLImageElement> =>
            this.loadBundledAsset(path).then(
                (url) =>
                    new Promise((resolve, reject) => {
                        const img = new window.Image();
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = url;
                    })
            );

        Promise.all([loadImg('popcat1.png'), loadImg('popcat2.png')])
            .then(([img1, img2]) => {
                this._popcat1 = img1;
                this._popcat2 = img2;
                this._assetsLoaded = true;
                this._assetsLoading = false;
            })
            .catch((err) => {
                console.error('[PopcatMidiDisplay] Failed to load assets:', err);
                this._assetsLoading = false;
            });
    }

    private _loadUserImage(src: string | File): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src instanceof File ? URL.createObjectURL(src) : src;
        });
    }

    private _applyAnimation(
        playAnimation: 'jump' | 'bump' | 'none',
        animStart: number,
        now: number,
        baseWidth: number,
        baseHeight: number
    ): { x: number; y: number; w: number; h: number } {
        const elapsed = now - animStart;
        const progress = Math.min(elapsed / ANIM_DURATION_MS, 1);
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
                    id: 'noteFilter',
                    label: 'Note Filter',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'manyCats',
                            type: 'boolean',
                            label: 'Many Cats',
                            default: true,
                            description:
                                'Display a grid of cats, one per distinct note in the track',
                            runtime: { transform: asBoolean, defaultValue: false },
                        },
                        {
                            key: 'noteSelect',
                            type: 'number',
                            label: 'Note Select',
                            default: 0,
                            min: 0,
                            max: 127,
                            step: 1,
                            description: 'Only activate on this MIDI note (0 = any note)',
                            visibleWhen: [{ key: 'manyCats', falsy: true }],
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'offset',
                            type: 'number',
                            label: 'Offset',
                            default: 0,
                            min: 0,
                            max: 127,
                            step: 1,
                            description: 'Skip this many of the lowest notes before placing cats (0 = start from the lowest note)',
                            visibleWhen: [{ key: 'manyCats', truthy: true }],
                            runtime: { transform: asNumber, defaultValue: 0 },
                        },
                        {
                            key: 'numCats',
                            type: 'number',
                            label: 'Num Cats',
                            default: 128,
                            min: 1,
                            max: 128,
                            step: 1,
                            description: 'Maximum number of cats to display',
                            visibleWhen: [{ key: 'manyCats', truthy: true }],
                            runtime: { transform: asNumber, defaultValue: 12 },
                        },
                        {
                            key: 'numRows',
                            type: 'number',
                            label: 'Num Rows',
                            default: 3,
                            min: 1,
                            max: 16,
                            step: 1,
                            description: 'Number of rows to distribute cats across. Notes fill left to right, bottom to top.',
                            visibleWhen: [{ key: 'manyCats', truthy: true }],
                            runtime: { transform: asNumber, defaultValue: 1 },
                        },
                        {
                            key: 'xSpacing',
                            type: 'number',
                            label: 'X Spacing',
                            default: 8,
                            min: 0,
                            max: 200,
                            step: 1,
                            description: 'Horizontal gap in pixels between cats',
                            visibleWhen: [{ key: 'manyCats', truthy: true }],
                            runtime: { transform: asNumber, defaultValue: 8 },
                        },
                        {
                            key: 'ySpacing',
                            type: 'number',
                            label: 'Y Spacing',
                            default: 8,
                            min: 0,
                            max: 200,
                            step: 1,
                            description: 'Vertical gap in pixels between rows',
                            visibleWhen: [{ key: 'manyCats', truthy: true }],
                            runtime: { transform: asNumber, defaultValue: 8 },
                        },
                        {
                            key: 'noteLabels',
                            type: 'boolean',
                            label: 'Note Labels',
                            default: false,
                            description: 'Show MIDI note names below each cat',
                            visibleWhen: [{ key: 'manyCats', truthy: true }],
                            runtime: { transform: asBoolean, defaultValue: false },
                        },
                        {
                            key: 'labelFontFamily',
                            type: 'font',
                            label: 'Label Font',
                            default: 'Inter',
                            description: 'Font family for note name labels (Google Fonts supported).',
                            visibleWhen: [{ key: 'manyCats', truthy: true }, { key: 'noteLabels', truthy: true }],
                            runtime: { transform: asTrimmedString, defaultValue: 'Inter' },
                        },
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
                        {
                            key: 'playAnimation',
                            type: 'select',
                            label: 'Play Animation',
                            default: 'jump',
                            options: [
                                { value: 'none', label: 'None' },
                                { value: 'jump', label: 'Jump' },
                                { value: 'bump', label: 'Bump' },
                            ],
                            description: 'Animation triggered when a note starts playing',
                            runtime: { transform: normalizePlayAnimation, defaultValue: 'none' as const },
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

        // Handle user sprite changes
        const newIdleSrc = (props.idleSprite as string | File | null) ?? null;
        const newActiveSrc = (props.activeSprite as string | File | null) ?? null;

        if (newIdleSrc !== this._currentIdleSource) {
            this._currentIdleSource = newIdleSrc;
            this._idleImg = null;
            if (newIdleSrc) {
                this._loadUserImage(newIdleSrc)
                    .then((img) => { this._idleImg = img; })
                    .catch(() => {});
            }
        }
        if (newActiveSrc !== this._currentActiveSource) {
            this._currentActiveSource = newActiveSrc;
            this._activeImg = null;
            if (newActiveSrc) {
                this._loadUserImage(newActiveSrc)
                    .then((img) => { this._activeImg = img; })
                    .catch(() => {});
            }
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

        const EPS = 1e-3;
        const manyCats = props.manyCats as boolean;
        const playAnimation = props.playAnimation as 'jump' | 'bump' | 'none';
        const baseWidth = props.imageWidth as number;
        const baseHeight = props.imageHeight as number;
        const idleImg = this._currentIdleSource ? this._idleImg : (this._assetsLoaded ? this._popcat2 : null);
        const activeImg = this._currentActiveSource ? this._activeImg : (this._assetsLoaded ? this._popcat1 : null);
        const now = performance.now();

        // ── Many cats: grid layout, one cat per distinct pitch ──────────────────
        if (manyCats) {
            const offset = props.offset as number;
            const numCats = props.numCats as number;
            const numRows = Math.max(1, props.numRows as number);
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

            const activeNoteSet = new Set(
                api.timeline
                    .selectNotesInWindow({ trackIds: [props.midiTrackId], startSec: targetTime - EPS, endSec: targetTime + EPS })
                    .map((n) => n.note)
            );

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
                    const isActive = activeNoteSet.has(pitch);

                    const catWas = this._catWasPlaying.get(pitch) ?? false;
                    if (isActive && !catWas) {
                        this._catAnimStartTime.set(pitch, now);
                    }
                    this._catWasPlaying.set(pitch, isActive);

                    const catAnimStart = this._catAnimStartTime.get(pitch) ?? -Infinity;
                    const { x: ax, y: ay, w: aw, h: ah } = isActive
                        ? this._applyAnimation(playAnimation, catAnimStart, now, baseWidth, baseHeight)
                        : { x: 0, y: 0, w: baseWidth, h: baseHeight };

                    const slotCenterX = rowOriginX + col * slotWidth + baseWidth / 2;
                    const imgX = slotCenterX - baseWidth / 2 + ax;
                    const imgY = rowCenterY - baseHeight / 2 + ay;
                    const img = isActive ? activeImg : idleImg;

                    objects.push(
                        new Image(imgX, imgY, aw, ah, img, 1, {
                            fitMode: 'contain',
                            preserveAspectRatio: true,
                        })
                    );

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

            let activeNotes = api.timeline.selectNotesInWindow({
                trackIds: [props.midiTrackId],
                startSec: targetTime - EPS,
                endSec: targetTime + EPS,
            });

            if (noteSelect !== 0) {
                activeNotes = activeNotes.filter((n) => n.note === noteSelect);
            }

            const isPlaying = activeNotes.length > 0;

            if (isPlaying && !this._wasPlaying) {
                this._animStartTime = now;
            }
            this._wasPlaying = isPlaying;

            const { x: imgX, y: imgY, w: imgW, h: imgH } = isPlaying
                ? this._applyAnimation(playAnimation, this._animStartTime, now, baseWidth, baseHeight)
                : { x: 0, y: 0, w: baseWidth, h: baseHeight };

            const img = isPlaying ? activeImg : idleImg;

            return [
                new Image(imgX, imgY, imgW, imgH, img, 1, {
                    fitMode: 'contain',
                    preserveAspectRatio: true,
                }),
            ];
        }
    }
}

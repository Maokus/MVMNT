import {
    SceneElement,
    prop,
    insertElementConfig,
    tab,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type TimelineNoteEvent,
} from '@mvmnt/plugin-sdk';
import { VisualMedia, Rectangle, type RenderObject } from '@mvmnt/plugin-sdk/render';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

// MIDI note % 4 → lane: 0=LEFT(purple), 1=DOWN(blue), 2=UP(green), 3=RIGHT(red)
const LANE_DIRS = ['Left', 'Down', 'Up', 'Right'] as const;
const SPLASH_COLORS = ['purple', 'blue', 'green', 'red'] as const;
const HOLD_COVER_COLORS = ['Purple', 'Blue', 'Green', 'Red'] as const;

// FNF-approximate RGBA hex colors for hold tail bodies
const HOLD_TAIL_COLORS = [
    '#C76DE1DD', // Left - purple
    '#44D3EFDD', // Down - blue
    '#53EF52DD', // Up - green
    '#F96060DD', // Right - red
] as const;

const CONFIRM_FPS = 24;
const CONFIRM_FRAMES = 4;
const CONFIRM_DURATION = CONFIRM_FRAMES / CONFIRM_FPS; // ~0.167s

// holdCoverStart is 1 frame; holdCover loop is 4 frames
const HOLD_COVER_START_DURATION = 1 / CONFIRM_FPS;
const HOLD_COVER_LOOP_DURATION = 4 / CONFIRM_FPS;

const SPLASH_DURATION = 0.35; // seconds the splash plays after note hit
const MAX_FALLING_NOTES = 24;
const HOLD_NOTE_MIN_DURATION = 0.05; // shorter notes treated as taps

// Strumline logical frame size in the noteStrumline atlas (approx, largest direction)
// Used to scale the VisualMedia so 'clip'+'center' shows the full frame.
const STRUMLINE_FRAME_W = 238;
const STRUMLINE_FRAME_H = 236;

// Hold cover logical frame size (same across all directions)
const HOLD_COVER_FRAME_W = 300;
const HOLD_COVER_FRAME_H = 400;

// notes.xml frames have no offset (frameX/Y = 0), so frame == texture size
const NOTE_FRAME_W = 157;

export class ArrowsElement extends SceneElement {
    private readonly _strumlineAtlas = this.bundledSparrow('noteStrumline.png', 'noteStrumline.xml');
    private readonly _notesAtlas = this.bundledSparrow('notes.png', 'notes.xml');
    private readonly _splashAtlas = this.bundledSparrow('noteSplashes.png', 'noteSplashes.xml');

    // Hold cover atlases: index matches lane (0=Purple/Left … 3=Red/Right)
    private readonly _holdCoverAtlases = [
        this.bundledSparrow('holdCoverPurple.png', 'holdCoverPurple.xml'),
        this.bundledSparrow('holdCoverBlue.png', 'holdCoverBlue.xml'),
        this.bundledSparrow('holdCoverGreen.png', 'holdCoverGreen.xml'),
        this.bundledSparrow('holdCoverRed.png', 'holdCoverRed.xml'),
    ];

    private readonly _layoutRect = new Rectangle(0, 0, 680, 600, '#00000000');

    // One VisualMedia per lane for each sprite layer
    private readonly _receptors: VisualMedia[] = Array.from(
        { length: 4 },
        () => new VisualMedia(0, 0, STRUMLINE_FRAME_W, STRUMLINE_FRAME_H, { layoutBoundsMode: 'none' })
    );
    private readonly _holdCovers: VisualMedia[] = Array.from(
        { length: 4 },
        () => new VisualMedia(0, 0, HOLD_COVER_FRAME_W, HOLD_COVER_FRAME_H, { layoutBoundsMode: 'none' })
    );
    private readonly _splashes: VisualMedia[] = Array.from(
        { length: 4 },
        () => new VisualMedia(0, 0, 260, 298, { layoutBoundsMode: 'none' })
    );

    // Pooled note head sprites for falling arrows
    private readonly _notePool: VisualMedia[] = Array.from(
        { length: MAX_FALLING_NOTES },
        () => new VisualMedia(0, 0, NOTE_FRAME_W, NOTE_FRAME_W, { layoutBoundsMode: 'none' })
    );

    constructor(id: string = 'arrows', config: Record<string, unknown> = {}) {
        super('arrows', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementConfig(
            super.getConfigSchema(),
            {
                name: 'Arrows',
                description: 'FNF-style arrow strumline with falling notes',
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
                        id: 'layout',
                        label: 'Layout',
                        collapsed: false,
                        properties: [
                            prop.number('laneSize', 'Lane Size', 157, { min: 40, max: 400, step: 1 }),
                            prop.number('laneGap', 'Lane Gap', 12, { min: 0, max: 100, step: 1 }),
                            prop.number('hitPosition', 'Hit Position', 0.85, { min: 0, max: 1, step: 0.01 }),
                            prop.number('scrollSpeed', 'Scroll Speed (px/s)', 400, { min: 50, max: 2000, step: 10 }),
                            prop.boolean('downscroll', 'Downscroll', false),
                        ],
                    },
                ]),
            ]
        );
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();
        if (!props.visible) return [];

        const laneSize = props.laneSize as number;
        const laneGap = props.laneGap as number;
        const hitFraction = props.hitPosition as number;
        const scrollSpeed = props.scrollSpeed as number;
        const downscroll = props.downscroll as boolean;

        const W = 4 * laneSize + 3 * laneGap;
        const H = W * 1.4;

        // hitY is the visual centre-Y of the strumline receptor row
        const hitY = hitFraction * H;

        this._layoutRect.width = W;
        this._layoutRect.height = H;

        // Sprite display sizes, scaled from reference frame dimensions
        const scale = laneSize / NOTE_FRAME_W; // NOTE_FRAME_W is our reference
        const strumW = STRUMLINE_FRAME_W * scale;
        const strumH = STRUMLINE_FRAME_H * scale;
        const coverW = HOLD_COVER_FRAME_W * scale;
        const coverH = HOLD_COVER_FRAME_H * scale;
        const tailW = laneSize * 0.55;

        // Look ahead far enough to fill the screen with approaching notes
        const lookAheadSec = H / scrollSpeed + 0.1;
        const lookBackSec = Math.max(SPLASH_DURATION, 0.1);

        const laneHeld: (TimelineNoteEvent | null)[] = [null, null, null, null];
        const laneSplash: ({ note: TimelineNoteEvent; elapsed: number } | null)[] = [null, null, null, null];
        // Approaching notes only (startTime >= targetTime), plus tailEndY for hold notes
        const fallingNotes: Array<{ note: TimelineNoteEvent; lane: number; headY: number; tailEndY: number | null }> = [];

        const { api, status } = getPluginHostApi([PLUGIN_CAPABILITIES.timelineRead]);
        const trackId = props.midiTrackId as string | null;

        if (trackId && api && status === 'ok') {
            const notes = api.timeline.selectNotesInWindow({
                trackIds: [trackId],
                startSec: targetTime - lookBackSec,
                endSec: targetTime + lookAheadSec,
            });

            for (const n of notes) {
                const lane = n.note % 4;

                // Track currently held notes for receptor animation + tail rendering
                if (n.startTime <= targetTime && targetTime < n.endTime) {
                    laneHeld[lane] = n;
                }

                // Splash: note hit within the last SPLASH_DURATION seconds
                const elapsed = targetTime - n.startTime;
                if (elapsed >= 0 && elapsed < SPLASH_DURATION) {
                    const prev = laneSplash[lane];
                    if (!prev || n.startTime > prev.note.startTime) {
                        laneSplash[lane] = { note: n, elapsed };
                    }
                }

                // Falling note arrows: only notes that haven't been played yet
                if (n.startTime >= targetTime) {
                    const headY = _noteY(n.startTime, targetTime, hitY, scrollSpeed, downscroll);
                    if (headY > -laneSize && headY < H + laneSize) {
                        const isHold = n.endTime - n.startTime > HOLD_NOTE_MIN_DURATION;
                        const tailEndY = isHold
                            ? _noteY(n.endTime, targetTime, hitY, scrollSpeed, downscroll)
                            : null;
                        fallingNotes.push({ note: n, lane, headY, tailEndY });
                    }
                }
            }
        }

        const objects: RenderObject[] = [this._layoutRect];

        const { resource: strumlineRes, status: strumlineStatus } = this._strumlineAtlas.get();
        const { resource: notesRes, status: notesStatus } = this._notesAtlas.get();
        const { resource: splashRes, status: splashStatus } = this._splashAtlas.get();

        // ── Hold tails for approaching hold notes (drawn first = behind everything) ──
        for (const { lane, headY, tailEndY } of fallingNotes) {
            if (tailEndY === null) continue;
            _drawHoldTail(objects, lane, laneSize, laneGap, tailW, headY, tailEndY);
        }

        // ── Hold tails for currently held notes (above approaching tails, below receptors) ──
        for (let i = 0; i < 4; i++) {
            const held = laneHeld[i];
            if (!held || held.endTime - held.startTime <= HOLD_NOTE_MIN_DURATION) continue;
            const tailEndY = _noteY(held.endTime, targetTime, hitY, scrollSpeed, downscroll);
            // Only draw while there is remaining tail above (upscroll) / below (downscroll) the strumline
            const tailRemains = downscroll ? tailEndY > hitY : tailEndY < hitY;
            if (tailRemains) {
                _drawHoldTail(objects, i, laneSize, laneGap, tailW, hitY, tailEndY);
            }
        }

        // ── Receptors ───────────────────────────────────────────────────────────────
        for (let i = 0; i < 4; i++) {
            const dir = LANE_DIRS[i]!;
            const held = laneHeld[i];
            const laneX = i * (laneSize + laneGap);

            let animName: string;
            let localTime: number;

            if (held) {
                const elapsed = targetTime - held.startTime;
                if (elapsed < CONFIRM_DURATION) {
                    animName = `confirm${dir}`;
                    localTime = elapsed;
                } else {
                    animName = `confirmHold${dir}`;
                    localTime = elapsed - CONFIRM_DURATION;
                }
            } else {
                animName = `static${dir}`;
                localTime = 0;
            }

            const receptor = this._receptors[i]!;
            receptor
                .setResource(strumlineRes, strumlineStatus)
                .setAnimation(animName)
                .setLocalTime(localTime)
                .setFitMode('clip')
                .setDimensions(strumW, strumH)
                // 'center' placement aligns the logical Sparrow frame to the VisualMedia
                // centre, so the trimmed sprite content renders without offset or clipping.
                .setFramePlacement('center');
            receptor.x = laneX + laneSize / 2 - strumW / 2;
            receptor.y = hitY - strumH / 2;

            objects.push(receptor);
        }

        // ── Falling note heads (drawn on top of tails) ──────────────────────────────
        let poolIdx = 0;
        for (const { note, lane, headY } of fallingNotes) {
            if (poolIdx >= MAX_FALLING_NOTES) break;
            const dir = LANE_DIRS[lane]!;
            const laneX = lane * (laneSize + laneGap);
            const sprite = this._notePool[poolIdx++]!;

            sprite
                .setResource(notesRes, notesStatus)
                .setAnimation(`note${dir}`)
                .setLocalTime(0)
                .setFitMode('clip')
                .setDimensions(laneSize, laneSize)
                .setFramePlacement('center');
            sprite.x = laneX + laneSize / 2 - laneSize / 2; // = laneX
            sprite.y = headY - laneSize / 2;
            sprite.opacity = 1;

            objects.push(sprite);

            void note; // suppress unused warning — note used for lane/headY above
        }

        // ── Hold cover overlays (on top of receptors while holding) ─────────────────
        for (let i = 0; i < 4; i++) {
            const held = laneHeld[i];
            if (!held || held.endTime - held.startTime <= HOLD_NOTE_MIN_DURATION) continue;

            const elapsed = targetTime - held.startTime;
            const colorName = HOLD_COVER_COLORS[i]!;
            const { resource: coverRes, status: coverStatus } = this._holdCoverAtlases[i]!.get();

            let animName: string;
            let localTime: number;

            if (elapsed < HOLD_COVER_START_DURATION) {
                animName = `holdCoverStart${colorName}`;
                localTime = elapsed;
            } else {
                animName = `holdCover${colorName}`;
                localTime = (elapsed - HOLD_COVER_START_DURATION) % HOLD_COVER_LOOP_DURATION;
            }

            const laneX = i * (laneSize + laneGap);
            const cover = this._holdCovers[i]!;
            cover
                .setResource(coverRes, coverStatus)
                .setAnimation(animName)
                .setLocalTime(localTime)
                .setFitMode('clip')
                .setDimensions(coverW, coverH)
                .setFramePlacement('center');
            // Centre the cover on the receptor centre (hitY, laneX + laneSize/2)
            cover.x = laneX + laneSize / 2 - coverW / 2;
            cover.y = hitY - coverH / 2;

            objects.push(cover);
        }

        // ── Splash effects (topmost layer) ───────────────────────────────────────────
        for (let i = 0; i < 4; i++) {
            const splashData = laneSplash[i];
            if (!splashData) continue;

            const { note, elapsed } = splashData;
            const color = SPLASH_COLORS[i]!;
            const variant = (note.note % 2) + 1; // deterministic 1 or 2 from pitch
            const animName = `note impact ${variant} ${color}`;

            const splashSize = laneSize * 1.65;
            const laneX = i * (laneSize + laneGap);

            const splash = this._splashes[i]!;
            splash
                .setResource(splashRes, splashStatus)
                .setAnimation(animName)
                .setLocalTime(elapsed)
                .setFitMode('clip')
                .setDimensions(splashSize, splashSize)
                .setFramePlacement('center');
            splash.x = laneX + laneSize / 2 - splashSize / 2;
            splash.y = hitY - splashSize / 2;
            splash.opacity = 1 - elapsed / SPLASH_DURATION;

            objects.push(splash);
        }

        return objects;
    }
}

// Returns the canvas Y coordinate for a note at noteTime, given current targetTime.
// hitY is the receptor centre Y. In upscroll approaching notes have y < hitY;
// in downscroll they have y > hitY.
function _noteY(
    noteTime: number,
    targetTime: number,
    hitY: number,
    scrollSpeed: number,
    downscroll: boolean
): number {
    const offset = (noteTime - targetTime) * scrollSpeed;
    return downscroll ? hitY + offset : hitY - offset;
}

// Draws a solid hold-tail rectangle between two Y positions.
// fromY / toY are both "centre" coordinates (same convention as _noteY).
function _drawHoldTail(
    objects: RenderObject[],
    lane: number,
    laneSize: number,
    laneGap: number,
    tailW: number,
    fromY: number,
    toY: number
): void {
    const topY = Math.min(fromY, toY);
    const height = Math.abs(toY - fromY);
    if (height <= 0) return;

    const laneX = lane * (laneSize + laneGap);
    const tail = new Rectangle(
        laneX + (laneSize - tailW) / 2,
        topY,
        tailW,
        height,
        HOLD_TAIL_COLORS[lane]!
    );
    tail.includeInLayoutBounds = false;
    objects.push(tail);
}

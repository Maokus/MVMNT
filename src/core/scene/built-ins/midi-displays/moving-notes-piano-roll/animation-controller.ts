// Animation controller for Moving Notes Piano Roll: static playhead, notes move.
import { createAnimationInstance, type AnimationPhase } from '@core/scene/built-ins/midi-displays/note-animations';
type MidiLikeNote = {
    note: number;
    channel?: number;
    velocity: number;
    startTime?: number;
    endTime?: number;
    startBeat?: number;
    endBeat?: number;
};
import { Rectangle, RenderObject } from '@core/render/render-objects';
import {
    clipTemporalInterval,
    mapTemporalPosition,
    type TemporalCoordinateConversions,
    type TemporalFrame,
} from '@core/timing';

export interface BuildConfig {
    noteHeight: number;
    minNote: number;
    maxNote: number;
    pianoWidth: number;
    rollWidth: number;
    playheadOffset: number; // pixels, applied to playhead x before clamping
    temporalFrame: TemporalFrame<'seconds'>;
    conversions: TemporalCoordinateConversions;
}

export interface VisualState {
    type: AnimationPhase;
    progress: number;
    startTime: number | null;
    endTime: number | null;
}

export class MovingNotesAnimationController {
    private owner: any;
    private _animationCache = new Map<string, ReturnType<typeof createAnimationInstance>>();

    constructor(owner: any) {
        this.owner = owner;
    }

    buildNoteRenderObjects(config: BuildConfig, noteBlocks: MidiLikeNote[]): RenderObject[] {
        const animationType = this.owner.getAnimationType();
        const attack = this.owner.getAttackDuration();
        const decay = this.owner.getDecayDuration();
        const release = this.owner.getReleaseDuration();
        const animationEnabled = animationType !== 'none';

        const { noteHeight, minNote, maxNote, pianoWidth, rollWidth, playheadOffset, temporalFrame, conversions } =
            config;
        const { value: currentTime } = temporalFrame.anchor;
        const { viewport } = temporalFrame;
        const totalNotes = maxNote - minNote + 1;

        const xFromTime = (t: number) => {
            // Preserve the historical offset behaviour by applying the pixel offset
            // before the final viewport clamp.
            const norm = mapTemporalPosition({ domain: 'seconds', value: t }, temporalFrame.mapping, conversions, {
                clamp: false,
            });
            const unclamped = pianoWidth + norm * rollWidth + playheadOffset;
            const minX = pianoWidth;
            const maxX = pianoWidth + rollWidth;
            return Math.max(minX, Math.min(maxX, unclamped));
        };

        const renderObjects: RenderObject[] = [];
        if (!noteBlocks || noteBlocks.length === 0) return renderObjects;

        for (const block of noteBlocks) {
            const channel = (block.channel ?? 0) as number;
            const start = (block.startTime ?? 0) as number;
            const end = (block.endTime ?? start) as number;
            const noteIndex = block.note - minNote;
            if (noteIndex < 0 || noteIndex >= totalNotes) continue;

            // Determine ADSR relative to playhead crossing (note start)
            const vis = this._deriveVisualStateRelativeToPlayhead(currentTime, start, end, { attack, decay, release });
            if (!vis) continue;

            // Clamp to visible window for geometry
            const clipped = clipTemporalInterval({ domain: 'seconds', start, end }, viewport);
            // Timeline selection already returns intervals intersecting the viewport. Keep the
            // historical edge fallback for animation-only frames if a host supplies otherwise.
            const drawStart = clipped?.start ?? Math.max(start, viewport.start);
            const drawEnd = clipped?.end ?? Math.min(end, viewport.end);

            const y = (totalNotes - (noteIndex + 1)) * noteHeight;
            const x1 = xFromTime(drawStart);
            const x2 = xFromTime(drawEnd);
            // width clamped to avoid exceeding viewport, also enforce min width
            const minX = pianoWidth;
            const maxX = pianoWidth + rollWidth;
            const left = Math.max(minX, Math.min(maxX, Math.min(x1, x2)));
            const right = Math.max(minX, Math.min(maxX, Math.max(x1, x2)));
            const width = Math.max(2, right - left);
            const x = left;

            const channelColors = this.owner.getChannelColors();
            const color = channelColors[channel % channelColors.length];

            if (!animationEnabled) {
                const rect = new Rectangle(x, y, width, noteHeight, { fillColor: color });
                rect.setLayoutParticipation('exclude');
                renderObjects.push(rect);
                continue;
            }
            const inst = this._getAnimationInstance(animationType);
            const progress = Math.max(0, Math.min(1, vis.progress));
            const phase = vis.type as AnimationPhase;
            const objs = inst.render({
                block: {
                    // minimal shape used by the note animations
                    note: block.note,
                    channel,
                    startTime: start,
                    endTime: end,
                    velocity: block.velocity,
                    isCurrentlyPlaying: (t: number) => start <= t && end > t,
                    baseNoteId: 'raw',
                    noteId: 'raw',
                } as any,
                x,
                y,
                width,
                height: noteHeight,
                color,
                progress,
                phase,
                currentTime,
            });
            renderObjects.push(...objs);
        }

        return renderObjects;
    }

    private _getAnimationInstance(type: string) {
        let inst = this._animationCache.get(type);
        if (!inst) {
            inst = createAnimationInstance(type);
            this._animationCache.set(type, inst);
        }
        return inst;
    }

    private _deriveVisualStateRelativeToPlayhead(
        currentTime: number,
        noteStart: number,
        noteEnd: number,
        phases: { attack: number; decay: number; release: number }
    ): VisualState | null {
        const EPS = 1e-9;
        const attackStart = noteStart - Math.max(0, phases.attack);
        const attackEnd = noteStart - EPS;
        const decayStart = noteStart;
        const decayEnd = Math.min(noteStart + Math.max(0, phases.decay), noteEnd);
        const sustainStart = decayEnd;
        const sustainEnd = noteEnd;
        const releaseStart = noteEnd + EPS;
        const releaseEnd = releaseStart + Math.max(0, phases.release);

        if (currentTime >= attackStart && currentTime < attackEnd) {
            return {
                type: 'attack',
                progress: (currentTime - attackStart) / (attackEnd - attackStart),
                startTime: attackStart,
                endTime: attackEnd,
            };
        }
        if (currentTime >= decayStart && currentTime < decayEnd) {
            return {
                type: 'decay',
                progress: (currentTime - decayStart) / (decayEnd - decayStart || 1),
                startTime: decayStart,
                endTime: decayEnd,
            };
        }
        if (currentTime >= sustainStart && currentTime < sustainEnd) {
            return { type: 'sustain', progress: 1, startTime: null, endTime: null };
        }
        if (currentTime >= releaseStart && currentTime < releaseEnd) {
            return {
                type: 'release',
                progress: (currentTime - releaseStart) / (releaseEnd - releaseStart || 1),
                startTime: releaseStart,
                endTime: releaseEnd,
            };
        }
        return null;
    }
}

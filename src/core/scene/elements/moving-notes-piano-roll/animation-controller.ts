// Animation controller for Moving Notes Piano Roll: static playhead, notes move.
import { createAnimationInstance, type AnimationPhase } from '@animation/note-animations';
import type { NoteBlock as TNoteBlock } from '@core/scene/elements/time-unit-piano-roll/note-block';
import { RenderObject } from '@core/render/render-objects';

export interface BuildConfig {
    noteHeight: number;
    minNote: number;
    maxNote: number;
    pianoWidth: number;
    rollWidth: number;
    playheadPosition: number; // 0..1 relative position inside roll area
    windowStart: number;
    windowEnd: number;
    currentTime: number;
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

    buildNoteRenderObjects(config: BuildConfig, noteBlocks: TNoteBlock[]): RenderObject[] {
        const animationType = this.owner.getAnimationType();
        const attack = this.owner.getAttackDuration();
        const decay = this.owner.getDecayDuration();
        const release = this.owner.getReleaseDuration();
        const animationEnabled = animationType !== 'none';

        const {
            noteHeight,
            minNote,
            maxNote,
            pianoWidth,
            rollWidth,
            playheadPosition,
            windowStart,
            windowEnd,
            currentTime,
        } = config;
        const totalNotes = maxNote - minNote + 1;
        const timeUnitInSeconds = Math.max(1e-9, windowEnd - windowStart);

        const xFromTime = (t: number) => {
            const norm = (t - currentTime) / timeUnitInSeconds + playheadPosition;
            return pianoWidth + norm * rollWidth;
        };

        const renderObjects: RenderObject[] = [];
        if (!noteBlocks || noteBlocks.length === 0) return renderObjects;

        for (const block of noteBlocks) {
            const noteIndex = block.note - minNote;
            if (noteIndex < 0 || noteIndex >= totalNotes) continue;

            // Determine ADSR relative to playhead crossing (note start)
            const start = block.originalStartTime ?? block.startTime;
            const end = block.originalEndTime ?? block.endTime;
            const vis = this._deriveVisualStateRelativeToPlayhead(currentTime, start, end, { attack, decay, release });
            if (!vis) continue;

            // Clamp to visible window for geometry
            const drawStart = Math.max(start, windowStart);
            const drawEnd = Math.min(end, windowEnd);
            if (!(drawEnd > windowStart && drawStart < windowEnd)) {
                // not visible in current window
                // still allow release/attack animations that may render without width if desired
            }

            const y = (totalNotes - (noteIndex + 1)) * noteHeight;
            const x1 = xFromTime(drawStart);
            const x2 = xFromTime(drawEnd);
            const width = Math.max(2, Math.abs(x2 - x1));
            const x = Math.min(x1, x2);

            const channelColors = this.owner.getChannelColors();
            const color = channelColors[block.channel % channelColors.length];

            const inst = this._getAnimationInstance(animationType === 'none' ? 'expand' : animationType);
            const progress = Math.max(0, Math.min(1, vis.progress));
            const phase = vis.type as AnimationPhase;
            const objs = inst.render({
                block,
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

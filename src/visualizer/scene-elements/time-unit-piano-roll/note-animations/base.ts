import { Rectangle } from '../../../render-objects';
import type { RenderObjectInterface } from '../../../types.js';
import type { NoteBlock } from '../note-block';

// ADSR phase names
export type AnimationPhase = 'attack' | 'decay' | 'sustain' | 'release' | 'static';

export interface AnimationContext {
    block: NoteBlock;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    progress: number; // 0..1 within the phase
    phase: AnimationPhase;
    currentTime: number; // absolute current playback time (seconds)
}

export abstract class BaseNoteAnimation {
    // Entry point for any concrete animation
    abstract render(ctx: AnimationContext): RenderObjectInterface[];

    // Utilities
    protected rect(
        x: number,
        y: number,
        width: number,
        height: number,
        color: string,
        alpha?: number
    ): RenderObjectInterface {
        const note = new Rectangle(x, y, Math.max(0, width), Math.max(0, height), color) as any;
        note.globalAlpha = alpha ?? 0.8;
        return note as unknown as RenderObjectInterface;
    }

    protected brighten(color: string, factor = 1.3): string {
        if (color.startsWith('#')) {
            const r = parseInt(color.substr(1, 2), 16);
            const g = parseInt(color.substr(3, 2), 16);
            const b = parseInt(color.substr(5, 2), 16);
            const nr = Math.min(255, Math.floor(r * factor));
            const ng = Math.min(255, Math.floor(g * factor));
            const nb = Math.min(255, Math.floor(b * factor));
            return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb
                .toString(16)
                .padStart(2, '0')}`;
        }
        return color;
    }
}

// Factory is defined in factory.ts to avoid circular imports

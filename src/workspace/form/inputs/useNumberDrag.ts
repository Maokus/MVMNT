import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type GetCurrentValue = () => number;

export interface NumberDragMeta {
    sessionId: string;
    finalize: boolean;
}

type OnNumberChange = (value: number, meta?: NumberDragMeta) => void;

export interface UseNumberDragOptions {
    disabled?: boolean;
    step?: number;
    min?: number;
    max?: number;
    getCurrentValue: GetCurrentValue;
    onChange: OnNumberChange;
    onPreview?: OnNumberChange;
}

interface NumberDragState {
    pointerId: number;
    startY: number;
    startValue: number;
    step: number;
    decimals: number;
    min?: number;
    max?: number;
    lastValue: number;
    prevCursor: string;
    prevUserSelect: string;
    active: boolean;
    captured: boolean;
    sessionId: string;
    hadChange: boolean;
}

const DRAG_THRESHOLD = 2;

export function getStepDecimals(step: number): number {
    if (!isFinite(step) || step <= 0) return 0;
    const str = step.toString();
    if (str.includes('e-')) {
        const match = /e-(\d+)/.exec(str);
        return match ? parseInt(match[1], 10) : 0;
    }
    const parts = str.split('.');
    return parts[1]?.length ?? 0;
}

export function useNumberDrag(options: UseNumberDragOptions) {
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const dragStateRef = useRef<NumberDragState | null>(null);

    const finishPointerDrag = useCallback((target: EventTarget | null, pointerId: number) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== pointerId) return;
        dragStateRef.current = null;

        if (drag.active) {
            document.body.style.cursor = drag.prevCursor;
            document.body.style.userSelect = drag.prevUserSelect;
        }

        if (drag.captured) {
            try {
                (target as HTMLElement | null)?.releasePointerCapture(pointerId);
            } catch {}
        }
    }, []);

    const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLInputElement>) => {
        const { disabled, step, min, max, getCurrentValue } = optionsRef.current;
        if (disabled || e.button !== 0) return;

        const rawStep = typeof step === 'number' && isFinite(step) && step > 0 ? step : 1;
        const decimals = getStepDecimals(rawStep);
        const startValueRaw = getCurrentValue();
        const startValue = isFinite(startValueRaw) ? startValueRaw : 0;

        const sessionId = `number-drag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

        dragStateRef.current = {
            pointerId: e.pointerId,
            startY: e.clientY,
            startValue,
            step: rawStep,
            decimals,
            min,
            max,
            lastValue: startValue,
            prevCursor: document.body.style.cursor,
            prevUserSelect: document.body.style.userSelect,
            active: false,
            captured: false,
            sessionId,
            hadChange: false,
        };
    }, []);

    const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLInputElement>) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;

        if (e.buttons === 0) {
            if (drag.hadChange) {
                const { onChange } = optionsRef.current;
                onChange(drag.lastValue, { sessionId: drag.sessionId, finalize: true });
            }
            finishPointerDrag(e.currentTarget, e.pointerId);
            return;
        }

        const deltaY = drag.startY - e.clientY;

        if (!drag.active) {
            if (Math.abs(deltaY) < DRAG_THRESHOLD) return;
            drag.active = true;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            try {
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.captured = true;
            } catch {}
        }

        const modifier = e.shiftKey ? 5 : e.ctrlKey || e.metaKey ? 0.1 : 1;
        const baseStep = drag.step || 1;
        let next = drag.startValue + deltaY * baseStep * modifier;

        if (drag.step > 0) {
            const stepped = Math.round(next / drag.step) * drag.step;
            next = drag.decimals > 0 ? parseFloat(stepped.toFixed(drag.decimals)) : stepped;
        }

        if (typeof drag.min === 'number') next = Math.max(drag.min, next);
        if (typeof drag.max === 'number') next = Math.min(drag.max, next);

        if (!isFinite(next) || next === drag.lastValue) return;

        drag.lastValue = next;
        drag.hadChange = true;

        const { onPreview, onChange } = optionsRef.current;
        onPreview?.(next);
        onChange(next, { sessionId: drag.sessionId, finalize: false });

        e.preventDefault();
    }, [finishPointerDrag]);

    const emitFinalizeIfNeeded = useCallback((drag: NumberDragState | null) => {
        if (!drag || !drag.hadChange) return;
        const { onChange } = optionsRef.current;
        onChange(drag.lastValue, { sessionId: drag.sessionId, finalize: true });
    }, []);

    const handlePointerUp = useCallback(
        (e: ReactPointerEvent<HTMLInputElement>) => {
            const drag = dragStateRef.current;
            if (!drag || drag.pointerId !== e.pointerId) {
                finishPointerDrag(e.currentTarget, e.pointerId);
                return;
            }
            emitFinalizeIfNeeded(drag);
            finishPointerDrag(e.currentTarget, e.pointerId);
        },
        [emitFinalizeIfNeeded, finishPointerDrag],
    );

    const handlePointerCancel = useCallback(
        (e: ReactPointerEvent<HTMLInputElement>) => {
            const drag = dragStateRef.current;
            if (drag && drag.pointerId === e.pointerId) {
                emitFinalizeIfNeeded(drag);
            }
            finishPointerDrag(e.currentTarget, e.pointerId);
        },
        [emitFinalizeIfNeeded, finishPointerDrag],
    );

    return {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
    };
}

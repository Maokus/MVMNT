import React, { useRef, useState } from 'react';

const LETTERS = [...'flexible'];

type Drag = { pointerId: number; index: number; startX: number; startY: number };

export const StretchyWord: React.FC = () => {
    const dragRef = useRef<Drag | null>(null);
    const [pull, setPull] = useState<{ index: number; x: number; y: number } | null>(null);

    const handlePointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
        if (event.button !== 0) return;
        const index = Number((event.target as HTMLElement).dataset.letterIndex);
        if (!Number.isInteger(index) || index < 0 || index >= LETTERS.length) return;

        dragRef.current = { pointerId: event.pointerId, index, startX: event.clientX, startY: event.clientY };
        setPull({ index, x: 0, y: 0 });
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
        const drag = dragRef.current;
        if (!drag || event.pointerId !== drag.pointerId) return;
        setPull({
            index: drag.index,
            x: Math.max(-110, Math.min(110, event.clientX - drag.startX)),
            y: Math.max(-70, Math.min(70, event.clientY - drag.startY)),
        });
    };

    const endDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
        if (event.pointerId !== dragRef.current?.pointerId) return;
        dragRef.current = null;
        setPull(null);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    return (
        <span
            className={`stretchy-word${pull ? ' is-dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
        >
            <span className="sr-only">flexible</span>
            <span aria-hidden="true" className="stretchy-letters">
                {LETTERS.map((letter, index) => {
                    const strength = pull ? Math.exp(-Math.abs(index - pull.index) * 0.8) : 0;
                    return (
                        <span
                            key={index}
                            data-letter-index={index}
                            className="stretchy-letter"
                            style={{
                                transform: `translate3d(${(pull?.x ?? 0) * strength}px, ${(pull?.y ?? 0) * strength}px, 0)`,
                            }}
                        >
                            {letter}
                        </span>
                    );
                })}
            </span>
        </span>
    );
};

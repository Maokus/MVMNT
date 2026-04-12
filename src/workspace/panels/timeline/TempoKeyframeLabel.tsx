import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTimelineStore } from '@state/timelineStore';

interface TempoKeyframeLabelProps {
    tick: number;
    bpm: number;
    x: number;
    y: number;
    selected: boolean;
}

/** Inline BPM label shown near a tempo keyframe diamond. Editable on double-click. */
const TempoKeyframeLabel: React.FC<TempoKeyframeLabelProps> = ({ tick, bpm, x, y, selected }) => {
    const [editing, setEditing] = useState(false);
    const [localValue, setLocalValue] = useState(String(bpm));
    const inputRef = useRef<HTMLInputElement>(null);
    const updateBpm = useTimelineStore((s) => s.updateTempoKeyframeBpm);

    useEffect(() => {
        if (!editing) setLocalValue(String(bpm));
    }, [bpm, editing]);

    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    const commit = useCallback(() => {
        const v = parseFloat(localValue);
        if (Number.isFinite(v) && v > 0) {
            updateBpm(tick, v);
        }
        setEditing(false);
    }, [localValue, tick, updateBpm]);

    if (editing) {
        return (
            <foreignObject x={x - 28} y={y - 24} width={56} height={20}>
                <input
                    ref={inputRef}
                    className="w-full bg-neutral-800 border border-blue-500 text-white text-[10px] text-center rounded px-1"
                    type="number"
                    min={1}
                    max={999}
                    step={0.1}
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setEditing(false);
                        e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            </foreignObject>
        );
    }

    return (
        <text
            x={x}
            y={y - 12}
            textAnchor="middle"
            className={`text-[9px] select-none cursor-default ${selected ? 'fill-white' : 'fill-neutral-400'}`}
            onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(true);
            }}
        >
            {Math.round(bpm * 10) / 10}
        </text>
    );
};

export default TempoKeyframeLabel;

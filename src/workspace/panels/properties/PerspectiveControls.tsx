import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    cameraDistanceToPerspectiveStrength,
    perspectiveStrengthToCameraDistance,
} from '@math/perspective-warp';
import type { FormInputChangeMeta } from '@workspace/forms/inputs/FormInput';

interface MergeSession {
    id: string;
    finalize: boolean;
}

const makeSessionId = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const TiltPad: React.FC<{
    rotationX: number;
    rotationY: number;
    disabled?: boolean;
    onChange: (rotationX: number, rotationY: number, meta?: FormInputChangeMeta) => void;
}> = ({ rotationX, rotationY, disabled = false, onChange }) => {
    const sessionRef = useRef<string | null>(null);

    const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>, finalize: boolean) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
        const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
        const nextY = Math.round((nx * 180 - 90) * 10) / 10;
        const nextX = Math.round(((1 - ny) * 180 - 90) * 10) / 10;
        const id = sessionRef.current ?? makeSessionId('perspective-tilt');
        sessionRef.current = finalize ? null : id;
        onChange(nextX, nextY, { mergeSession: { id, finalize } });
    };

    const x = Math.max(0, Math.min(100, ((rotationY + 90) / 180) * 100));
    const y = Math.max(0, Math.min(100, ((90 - rotationX) / 180) * 100));

    return (
        <div
            className="relative h-24 w-full overflow-hidden rounded border border-control2 bg-control"
            style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
            title="Drag horizontally for Y tilt and vertically for X tilt"
            onPointerDown={(event) => {
                if (disabled || event.button !== 0) return;
                sessionRef.current = makeSessionId('perspective-tilt');
                event.currentTarget.setPointerCapture(event.pointerId);
                updateFromPointer(event, false);
            }}
            onPointerMove={(event) => {
                if (disabled || !sessionRef.current || event.buttons === 0) return;
                updateFromPointer(event, false);
            }}
            onPointerUp={(event) => {
                if (disabled || !sessionRef.current) return;
                updateFromPointer(event, true);
                try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
            }}
            onPointerCancel={(event) => {
                if (!sessionRef.current) return;
                updateFromPointer(event, true);
                sessionRef.current = null;
            }}
        >
            <div className="absolute left-1/2 top-0 h-full w-px bg-control2" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-control2" />
            <div
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-accent shadow"
                style={{ left: `${x}%`, top: `${y}%` }}
            />
        </div>
    );
};

export const StrengthInput: React.FC<{
    value: number;
    disabled?: boolean;
    onChange: (value: number, meta?: FormInputChangeMeta) => void;
}> = ({ value, disabled = false, onChange }) => {
    const sessionRef = useRef<string | null>(null);
    const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50));
    return (
        <div className="flex items-center gap-2">
            <input
                className="min-w-0 flex-1"
                type="range"
                min={0}
                max={100}
                step={1}
                value={clamped}
                disabled={disabled}
                onPointerDown={() => { sessionRef.current = makeSessionId('perspective-strength'); }}
                onChange={(event) => {
                    const id = sessionRef.current;
                    onChange(Number(event.target.value), id ? { mergeSession: { id, finalize: false } } : undefined);
                }}
                onPointerUp={(event) => {
                    const id = sessionRef.current;
                    if (!id) return;
                    sessionRef.current = null;
                    onChange(Number(event.currentTarget.value), { mergeSession: { id, finalize: true } });
                }}
            />
            <input
                className="w-16"
                type="number"
                min={0}
                max={100}
                step={1}
                value={clamped}
                disabled={disabled}
                onChange={(event) => onChange(Math.max(0, Math.min(100, Number(event.target.value))))}
            />
            <span className="text-xs text-muted">%</span>
        </div>
    );
};

const GRID_POINTS = [0, 0.5, 1] as const;

export const PointGrid: React.FC<{
    x: number;
    y: number;
    label: string;
    disabled?: boolean;
    onChange: (x: number, y: number) => void;
}> = ({ x, y, label, disabled = false, onChange }) => (
    <div>
        <div className="mb-1 text-xs text-muted">{label}</div>
        <div className="grid w-20 grid-cols-3 gap-1" role="group" aria-label={label}>
            {GRID_POINTS.flatMap((py) => GRID_POINTS.map((px) => {
                const active = Math.abs(x - px) < 1e-6 && Math.abs(y - py) < 1e-6;
                return (
                    <button
                        key={`${px}:${py}`}
                        type="button"
                        disabled={disabled}
                        className={`h-5 rounded border ${active ? 'border-accent bg-accent' : 'border-control2 bg-control'}`}
                        aria-label={`${label} ${px}, ${py}`}
                        onClick={() => onChange(px, py)}
                    />
                );
            }))}
        </div>
    </div>
);

export const CameraDistanceInput: React.FC<{
    strength: number;
    disabled?: boolean;
    onChange: (strength: number) => void;
}> = ({ strength, disabled = false, onChange }) => {
    const distance = perspectiveStrengthToCameraDistance(strength);
    const display = useMemo(() => Number.isFinite(distance) ? distance.toFixed(2) : '', [distance]);
    const [localValue, setLocalValue] = useState(display || '∞');
    useEffect(() => setLocalValue(display || '∞'), [display]);
    return (
        <label className="flex items-center justify-between gap-2 text-xs">
            <span title="Derived camera distance measured in element diagonals">Camera Distance</span>
            <input
                className="w-24"
                type="text"
                value={localValue}
                disabled={disabled}
                onChange={(event) => setLocalValue(event.target.value)}
                onBlur={(event) => {
                    const raw = event.currentTarget.value.trim();
                    onChange(raw === '∞' || raw.toLowerCase() === 'infinity'
                        ? 0
                        : cameraDistanceToPerspectiveStrength(Number(raw)));
                }}
            />
        </label>
    );
};

export type PerspectiveMergeSession = MergeSession;

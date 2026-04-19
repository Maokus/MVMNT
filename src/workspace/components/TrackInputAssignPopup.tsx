import React, { useEffect, useRef, useState } from 'react';
import TimelineTrackSelect from '@workspace/form/inputs/TimelineTrackSelect';
import type { TrackInputDef } from '@context/SceneSelectionContext';

interface Props {
    elementId: string;
    trackInputs: TrackInputDef[];
    onDismiss: () => void;
    onAssign: (assignments: Record<string, string | string[] | null>) => void;
}

const TrackInputAssignPopup: React.FC<Props> = ({ elementId, trackInputs, onDismiss, onAssign }) => {
    const popupRef = useRef<HTMLDivElement | null>(null);

    const [values, setValues] = useState<Record<string, string | string[] | null>>(() => {
        const init: Record<string, string | string[] | null> = {};
        for (const t of trackInputs) {
            init[t.key] = t.allowMultiple ? [] : null;
        }
        return init;
    });

    const handleAssign = () => {
        onAssign(values);
    };

    return (
        // No pointer-events-none here — native <select> elements don't reliably receive
        // events when a DOM ancestor has pointer-events:none.
        // onPointerDown stopPropagation prevents canvas mousedown from deselecting the element.
        <div
            className="fixed bottom-4 left-4 z-[70] max-w-[320px] sm:max-w-xs md:max-w-sm"
            data-preserve-selection="true"
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                ref={popupRef}
                className="flex flex-col gap-3 rounded-lg border border-amber-400/40 bg-neutral-950/95 p-4 text-[12px] text-neutral-100 shadow-[0_12px_24px_rgba(0,0,0,0.45)] backdrop-blur"
            >
                <div className="text-[13px] font-semibold text-amber-100">
                    Added element with track input{trackInputs.length > 1 ? 's' : ''}
                </div>
                <p className="m-0 text-neutral-200">
                    Assign track input{trackInputs.length > 1 ? 's' : ''}?
                </p>
                <div className="flex flex-col gap-2">
                    {trackInputs.map((t) => (
                        <div key={t.key} className="flex flex-col gap-1">
                            <label className="text-[11px] text-neutral-400">{t.label}</label>
                            {/* ae-style + ae-property-input gives the same select styling as the property panel */}
                            <div className="ae-style">
                                <div className="ae-property-input" style={{ maxWidth: '100%', minWidth: 0 }}>
                                    <TimelineTrackSelect
                                        id={`track-assign-${elementId}-${t.key}`}
                                        value={values[t.key] ?? null}
                                        schema={{
                                            allowMultiple: t.allowMultiple,
                                            allowedTrackTypes: t.allowedTrackTypes,
                                        }}
                                        onChange={(val) => setValues((prev) => ({ ...prev, [t.key]: val }))}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className="rounded border border-neutral-700 px-3 py-1 text-[12px] font-medium text-neutral-300 transition hover:bg-neutral-800"
                        onClick={onDismiss}
                    >
                        Dismiss
                    </button>
                    <button
                        type="button"
                        className="rounded border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 text-[12px] font-medium text-emerald-100 transition hover:bg-emerald-500/30"
                        onClick={handleAssign}
                    >
                        Assign
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TrackInputAssignPopup;

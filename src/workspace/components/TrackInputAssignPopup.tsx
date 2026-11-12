import React, { useState } from 'react';
import TimelineTrackSelect from '@workspace/forms/inputs/TimelineTrackSelect';
import { compatibleTrackIds, validTrackSelection, type TrackInputDef } from '@context/trackInputSetup';
import { useTimelineStore } from '@state/timelineStore';
import { Button } from './Button';
import { PopupCard } from './PopupCard';

interface Props {
    elementId: string;
    trackInputs: TrackInputDef[];
    onDismiss: () => void;
    onAssign: (assignments: Record<string, string | string[] | null>) => void;
}

const TrackInputAssignPopup: React.FC<Props> = ({ elementId, trackInputs, onDismiss, onAssign }) => {
    const [values, setValues] = useState<Record<string, string | string[] | null>>(() => {
        const init: Record<string, string | string[] | null> = {};
        for (const t of trackInputs) {
            init[t.key] = t.allowMultiple ? [] : null;
        }
        return init;
    });

    const tracks = useTimelineStore((state) => state.tracks);
    const assignments = Object.fromEntries(
        trackInputs
            .filter((input) => validTrackSelection(input, values[input.key], tracks))
            .map((input) => [input.key, values[input.key]])
    );
    const handleAssign = () => {
        if (Object.keys(assignments).length) onAssign(assignments);
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
            <PopupCard title="Connect tracks">
                <p className="m-0 text-neutral-200">Choose tracks to connect this element.</p>
                <div className="flex flex-col gap-2">
                    {trackInputs.map((t) => (
                        <div key={t.key} className="flex flex-col gap-1">
                            <label
                                htmlFor={`track-assign-${elementId}-${t.key}`}
                                className="text-[11px] text-neutral-400"
                            >
                                {t.label}
                            </label>
                            {!compatibleTrackIds(t, tracks).length && (
                                <p className="m-0 text-neutral-400">
                                    Import{' '}
                                    {t.allowedTrackTypes?.length === 1 && t.allowedTrackTypes[0] === 'audio'
                                        ? 'an audio'
                                        : t.allowedTrackTypes?.includes('audio')
                                          ? 'a MIDI or audio'
                                          : 'a MIDI'}{' '}
                                    file in the timeline to connect this element.
                                </p>
                            )}
                            {/* ae-style + ae-property-input gives the same select styling as the property panel */}
                            <div className="ae-style">
                                <div className="ae-property-input" style={{ maxWidth: '100%', minWidth: 0 }}>
                                    <TimelineTrackSelect
                                        id={`track-assign-${elementId}-${t.key}`}
                                        value={
                                            validTrackSelection(t, values[t.key], tracks)
                                                ? values[t.key]
                                                : t.allowMultiple
                                                  ? []
                                                  : null
                                        }
                                        disabled={!compatibleTrackIds(t, tracks).length}
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
                    <Button variant="muted" size="sm" onClick={onDismiss}>
                        Later
                    </Button>
                    <Button
                        variant="accent"
                        size="sm"
                        onClick={handleAssign}
                        disabled={!Object.keys(assignments).length}
                    >
                        Assign
                    </Button>
                </div>
            </PopupCard>
        </div>
    );
};

export default TrackInputAssignPopup;

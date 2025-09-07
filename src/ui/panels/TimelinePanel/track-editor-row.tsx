import React, { useCallback } from 'react';
import { useTimelineStore, type TimelineTrack } from '@state/timelineStore';

const RowButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...rest }) => (
    <button
        {...rest}
        className={(rest.className || '') + ' px-2 py-0.5 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center disabled:opacity-60'}
    >
        {children}
    </button>
);

const TrackEditorRow: React.FC<{ trackId: string }> = ({ trackId }) => {
    const track = useTimelineStore((s) => s.tracks[trackId]);
    const setEnabled = useTimelineStore((s) => s.setTrackEnabled);
    const setMute = useTimelineStore((s) => s.setTrackMute);
    const setSolo = useTimelineStore((s) => s.setTrackSolo);
    const setOffset = useTimelineStore((s) => s.setTrackOffset);
    const setRegion = useTimelineStore((s) => s.setTrackRegion);
    const removeTrack = useTimelineStore((s) => s.removeTrack);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const order = useTimelineStore((s) => s.tracksOrder);
    const reorder = useTimelineStore((s) => s.reorderTracks);
    const updateTrack = useTimelineStore((s) => s.updateTrack);

    if (!track) return null;

    const onNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        updateTrack(trackId, { name: e.target.value });
    }, [trackId, updateTrack]);

    return (
        <div className="timeline-row flex items-center gap-1.5 py-0.5 px-1.5 border-b border-neutral-800 bg-neutral-900/40 text-xs">
            <input
                className="text-input bg-neutral-900 border-neutral-700 rounded px-1 py-0.5 w-[120px]"
                value={track.name}
                onChange={onNameChange}
            />
            <span className="text-[10px] text-neutral-500">{track.type.toUpperCase()}</span>
            <label className="text-[11px] text-neutral-300 flex items-center gap-1">
                <input type="checkbox" checked={track.enabled} onChange={(e) => setEnabled(trackId, e.target.checked)} />
                Enabled
            </label>
            <label className="text-[11px] text-neutral-300 flex items-center gap-1">
                <input type="checkbox" checked={track.mute} onChange={(e) => setMute(trackId, e.target.checked)} />
                Mute
            </label>
            <label className="text-[11px] text-neutral-300 flex items-center gap-1">
                <input type="checkbox" checked={track.solo} onChange={(e) => setSolo(trackId, e.target.checked)} />
                Solo
            </label>
            <label className="text-[11px] text-neutral-300 flex items-center gap-1.5">
                Offset (s)
                <input
                    className="number-input w-[56px] px-1 py-0.5"
                    type="number"
                    step={0.01}
                    value={track.offsetSec}
                    onChange={(e) => setOffset(trackId, parseFloat(e.target.value) || 0)}
                />
            </label>
            <label className="text-[11px] text-neutral-300 flex items-center gap-1.5">
                Region
                <input
                    className="number-input w-[56px] px-1 py-0.5"
                    type="number"
                    step={0.01}
                    value={track.regionStartSec ?? ''}
                    placeholder="start"
                    onChange={(e) => setRegion(trackId, e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0), track.regionEndSec)}
                />
                <span>–</span>
                <input
                    className="number-input w-[56px] px-1 py-0.5"
                    type="number"
                    step={0.01}
                    value={track.regionEndSec ?? ''}
                    placeholder="end"
                    onChange={(e) => setRegion(trackId, track.regionStartSec, e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))}
                />
            </label>
            <div className="flex-1 flex items-center gap-1">
                {!track.enabled && <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">Disabled</span>}
                {track.mute && <span className="text-[10px] bg-yellow-900/40 text-yellow-300 px-1.5 py-0.5 rounded">Muted</span>}
                {track.regionStartSec != null || track.regionEndSec != null ? (
                    <span className="text-[10px] bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded">Region</span>
                ) : null}
            </div>
            <RowButton onClick={() => {
                const idx = order.indexOf(trackId);
                if (idx > 0) {
                    const next = [...order];
                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                    reorder(next);
                }
            }} title="Move up">▲</RowButton>
            <RowButton onClick={() => {
                const idx = order.indexOf(trackId);
                if (idx >= 0 && idx < order.length - 1) {
                    const next = [...order];
                    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                    reorder(next);
                }
            }} title="Move down">▼</RowButton>
            <RowButton onClick={async () => {
                const id = await addMidiTrack({ name: track.name + ' Copy', midiData: track.midiSourceId ? (useTimelineStore.getState().midiCache[track.midiSourceId!]?.midiData as any) : undefined, offsetSec: track.offsetSec });
                // Copy region and flags
                const st = useTimelineStore.getState();
                st.updateTrack(id, { regionStartSec: track.regionStartSec, regionEndSec: track.regionEndSec, enabled: track.enabled, mute: track.mute, solo: track.solo });
            }} title="Duplicate track">Duplicate</RowButton>
            <RowButton onClick={() => removeTrack(trackId)} title="Remove track">Remove</RowButton>
        </div>
    );
};

export default TrackEditorRow;

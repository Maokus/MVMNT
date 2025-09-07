import React, { useEffect, useMemo, useRef } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { selectMidiTracks, selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from '../TransportControls';
import TrackList from './track-list';
import TrackLanes from './TrackLanes';
import TimelineRuler from './TimelineRuler';
import { useVisualizer } from '@context/VisualizerContext';
import { secondsToBars, secondsToBeatsSelector } from '@state/selectors/timing';

const TimelinePanel: React.FC = () => {
    const { visualizer } = useVisualizer();
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        await addMidiTrack({ name: f.name.replace(/\.[^/.]+$/, ''), file: f });
        if (fileRef.current) fileRef.current.value = '';
    };

    // Optional: on mount, nudge visualizer play range to current ruler state (no-op when already synced)
    useEffect(() => {
        if (!visualizer) return;
        try {
            const { startSec, endSec } = useTimelineStore.getState().timelineView;
            const { loopEnabled, loopStartSec, loopEndSec } = useTimelineStore.getState().transport;
            const loopActive = !!loopEnabled && typeof loopStartSec === 'number' && typeof loopEndSec === 'number' && loopEndSec > loopStartSec;
            visualizer.setPlayRange?.(loopActive ? (loopStartSec as number) : startSec, loopActive ? (loopEndSec as number) : endSec);
        } catch { }
    }, [visualizer]);

    return (
        <div className="timeline-panel" role="region" aria-label="Timeline panel">
            {/* Header: left add-track, center transport, right view + loop + quantize + time */}
            <div className="timeline-header grid grid-cols-3 items-center px-2 py-1 bg-neutral-900/40 border-b border-neutral-800">
                {/* Left: Add track */}
                <div className="flex items-center gap-2">
                    <label className="px-2 py-1 border border-neutral-700 rounded cursor-pointer text-xs font-medium bg-neutral-900/50 hover:bg-neutral-800/60">
                        Add MIDI Track
                        <input ref={fileRef} type="file" accept=".mid,.midi" className="hidden" onChange={handleAddFile} />
                    </label>
                </div>
                {/* Center: transport buttons only */}
                <div className="flex items-center justify-center justify-self-center">
                    <TransportControls />
                </div>
                {/* Right: timeline view + loop/quantize buttons + time indicator */}
                <div className="justify-self-end">
                    <HeaderRightControls />
                </div>
            </div>
            <div className="timeline-body flex items-stretch gap-0">
                {/* Left: Track list */}
                <div className="tracklist-container w-60 shrink-0 overflow-y-auto border-r border-neutral-800">
                    <TrackList trackIds={trackIds} />
                </div>

                {/* Right: Ruler stacked above lanes */}
                <div className="flex-1 min-w-0 flex flex-col">
                    <TimelineRuler />
                    <TrackLanes trackIds={trackIds} />
                </div>
            </div>
        </div>
    );
};

export default TimelinePanel;

// Right-side header controls: view start/end inputs, loop/quantize toggles, current time
const HeaderRightControls: React.FC = () => {
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineView = useTimelineStore((s) => s.setTimelineView);
    const current = useTimelineStore((s) => s.timeline.currentTimeSec);
    const loopEnabled = useTimelineStore((s) => s.transport.loopEnabled);
    const loopStart = useTimelineStore((s) => s.transport.loopStartSec);
    const loopEnd = useTimelineStore((s) => s.transport.loopEndSec);
    const setLoopEnabled = useTimelineStore((s) => s.setLoopEnabled);
    const setLoopRange = useTimelineStore((s) => s.setLoopRange);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);

    const fmt = (s: number) => {
        const sign = s < 0 ? '-' : '';
        const abs = Math.abs(s);
        const m = Math.floor(abs / 60);
        const sec = Math.floor(abs % 60);
        const ms = Math.floor((abs * 1000) % 1000);
        return `${sign}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const beats = useTimelineStore((s) => secondsToBeatsSelector(s, s.timeline.currentTimeSec));
    const bars = useTimelineStore((s) => secondsToBars(s, s.timeline.currentTimeSec));

    return (
        <div className="flex items-center gap-2 text-[12px]">
            {/* Time indicator */}
            <div className="ml-1 text-neutral-400">
                t = {fmt(current)}
                <span className="ml-2">beats: {beats.toFixed(2)}</span>
                <span className="ml-2">bars: {bars.toFixed(2)}</span>
            </div>
            <label className="text-neutral-300 flex items-center gap-1">
                Start/End
                <input aria-label="View start (seconds)" className="number-input w-[70px]" type="number" step={0.01} value={view.startSec}
                    onChange={(e) => setTimelineView(parseFloat(e.target.value) || 0, view.endSec)} />
                <span>–</span>
                <input aria-label="View end (seconds)" className="number-input w-[70px]" type="number" step={0.01} value={view.endSec}
                    onChange={(e) => setTimelineView(view.startSec, parseFloat(e.target.value) || 0)} />
            </label>

            {/* Loop toggle (icon button) */}
            <button
                className={`px-2 py-1 rounded border border-neutral-700 ${loopEnabled ? 'bg-blue-600/70 text-white' : 'bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60'}`}
                title="Toggle loop"
                onClick={() => setLoopEnabled(!loopEnabled)}
            >
                ⟲
            </button>
            {/* Loop start/end inputs */}
            <input className="number-input w-[70px]" type="number" step={0.01} value={loopStart ?? ''} placeholder="loop start"
                onChange={(e) => setLoopRange(e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0), loopEnd)} />
            <span>–</span>
            <input className="number-input w-[70px]" type="number" step={0.01} value={loopEnd ?? ''} placeholder="loop end"
                onChange={(e) => setLoopRange(loopStart, e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))} />

            {/* Quantize toggle (Q button) */}
            <button
                className={`px-2 py-1 rounded border border-neutral-700 ${quantize === 'bar' ? 'bg-blue-600/70 text-white' : 'bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60'}`}
                title="Toggle quantize to bar"
                onClick={() => setQuantize(quantize === 'bar' ? 'off' : 'bar')}
            >
                Q
            </button>

        </div>
    );
};

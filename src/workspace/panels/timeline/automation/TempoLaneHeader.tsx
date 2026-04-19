import React, { useCallback, useMemo } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { AUTOMATION_HEADER_HEIGHT, TEMPO_LANE_HEIGHT } from '../constants';

/** Left-column header for the tempo automation lane. */
const TempoLaneHeader: React.FC = () => {
    const tempoAutomation = useTimelineStore((s) => s.timeline.tempoAutomation);
    const enableTempoAutomation = useTimelineStore((s) => s.enableTempoAutomation);
    const disableTempoAutomation = useTimelineStore((s) => s.disableTempoAutomation);
    const setTempoLaneVisible = useTimelineStore((s) => s.setTempoLaneVisible);
    const enabled = tempoAutomation?.enabled ?? false;
    const laneVisible = tempoAutomation?.laneVisible !== false;
    const keyframes = tempoAutomation?.keyframes ?? [];

    const bpmRange = useMemo(() => {
        if (keyframes.length === 0) return null;
        const bpms = keyframes.map((kf) => kf.bpm);
        return { min: Math.min(...bpms), max: Math.max(...bpms) };
    }, [keyframes]);

    const toggleEnabled = useCallback(() => {
        if (enabled) {
            disableTempoAutomation();
        } else {
            enableTempoAutomation();
        }
    }, [enabled, enableTempoAutomation, disableTempoAutomation]);

    const toggleVisible = useCallback(() => {
        setTempoLaneVisible(!laneVisible);
    }, [laneVisible, setTempoLaneVisible]);

    return (
        <div className="border-t border-neutral-700">
            {/* Header row */}
            <div
                className="flex items-center justify-between gap-1 px-2 border-b border-neutral-800 bg-neutral-900/60 text-neutral-300"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">Tempo</span>
                <div className="flex items-center gap-1">
                    {enabled && (
                        <button
                            className="text-[9px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
                            onClick={toggleVisible}
                            title={laneVisible ? 'Hide tempo lane' : 'Show tempo lane'}
                        >
                            {laneVisible ? 'Hide' : 'Show'}
                        </button>
                    )}
                    <button
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${enabled
                            ? 'border-amber-500/50 bg-amber-600/30 text-amber-300 hover:bg-amber-600/50'
                            : 'border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                            }`}
                        onClick={toggleEnabled}
                        title={enabled ? 'Disable tempo automation' : 'Enable tempo automation'}
                    >
                        {enabled ? 'ON' : 'OFF'}
                    </button>
                </div>
            </div>
            {/* Lane spacer (synced with right column lane height) */}
            {enabled && laneVisible && (
                <div
                    className="flex flex-col justify-center px-2 border-b border-neutral-800/60 bg-neutral-900/30 text-neutral-500"
                    style={{ height: TEMPO_LANE_HEIGHT }}
                >
                    <span className="text-[9px]">BPM</span>
                    {bpmRange && (
                        <span className="text-[8px] text-neutral-600">
                            {Math.round(bpmRange.min)}–{Math.round(bpmRange.max)}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default TempoLaneHeader;

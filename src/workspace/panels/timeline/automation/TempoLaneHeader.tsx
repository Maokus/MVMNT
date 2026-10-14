import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@state/timelineStore';
import { AUTOMATION_HEADER_HEIGHT, TEMPO_LANE_HEIGHT } from '../constants';
import { useTempoRange } from '../context/tempoRangeContext';
import { Button } from '@workspace/components/Button';

const formatBpm = (value: number) => value.toFixed(1);

const TempoRangeControls: React.FC = () => {
    const { autoRange, range, setAutoRange, setManualRange } = useTempoRange();
    const [minText, setMinText] = useState(() => formatBpm(range.min));
    const [maxText, setMaxText] = useState(() => formatBpm(range.max));
    const minFocused = useRef(false);
    const maxFocused = useRef(false);

    useEffect(() => {
        if (!minFocused.current) setMinText(formatBpm(range.min));
        if (!maxFocused.current) setMaxText(formatBpm(range.max));
    }, [range.min, range.max]);

    const commit = (bound: 'min' | 'max', text: string) => {
        const value = text.trim() ? Number(text) : NaN;
        const next = { ...range, [bound]: value };
        if (!setManualRange(next)) {
            if (bound === 'min') setMinText(formatBpm(range.min));
            else setMaxText(formatBpm(range.max));
        }
    };

    return (
        <div
            className="flex flex-col items-center justify-center gap-1 border-b border-neutral-800 bg-neutral-900"
            style={{ height: TEMPO_LANE_HEIGHT }}
        >
            <span className="text-[9px] text-neutral-500">BPM range</span>
            <div className="flex items-center gap-1 text-[9px] text-neutral-500">
                <input
                    aria-label="Minimum visible BPM"
                    type="text"
                    inputMode="decimal"
                    className="w-12 rounded border border-neutral-800 bg-neutral-950 px-1 text-right text-neutral-200 read-only:text-neutral-500"
                    value={autoRange ? formatBpm(range.min) : minText}
                    readOnly={autoRange}
                    onChange={(event) => setMinText(event.target.value)}
                    onFocus={() => (minFocused.current = true)}
                    onBlur={(event) => {
                        minFocused.current = false;
                        if (!autoRange) commit('min', event.target.value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                />
                <span>–</span>
                <input
                    aria-label="Maximum visible BPM"
                    type="text"
                    inputMode="decimal"
                    className="w-12 rounded border border-neutral-800 bg-neutral-950 px-1 text-right text-neutral-200 read-only:text-neutral-500"
                    value={autoRange ? formatBpm(range.max) : maxText}
                    readOnly={autoRange}
                    onChange={(event) => setMaxText(event.target.value)}
                    onFocus={() => (maxFocused.current = true)}
                    onBlur={(event) => {
                        maxFocused.current = false;
                        if (!autoRange) commit('max', event.target.value);
                    }}
                />
                <Button
                    variant="ghost"
                    size="full"
                    aria-label="Auto fit BPM range"
                    aria-pressed={autoRange}
                    className={`px-1.5 text-[9px] ${autoRange ? 'bg-neutral-800 text-amber-300' : ''}`}
                    onClick={() => {
                        if (autoRange) setManualRange(range);
                        else setAutoRange(true);
                    }}
                >
                    auto
                </Button>
            </div>
            <span className="text-[8px] text-neutral-600">Double-click the lane to add</span>
        </div>
    );
};

/** Left-column header for the tempo automation lane. */
const TempoLaneHeader: React.FC = () => {
    const tempoAutomation = useTimelineStore((s) => s.timeline.tempoAutomation);
    const enableTempoAutomation = useTimelineStore((s) => s.enableTempoAutomation);
    const disableTempoAutomation = useTimelineStore((s) => s.disableTempoAutomation);
    const resetTempoAutomationChanges = useTimelineStore((s) => s.resetTempoAutomationChanges);
    const setTempoLaneVisible = useTimelineStore((s) => s.setTempoLaneVisible);
    const enabled = tempoAutomation?.enabled ?? false;
    const laneVisible = tempoAutomation?.laneVisible !== false;
    const keyframes = tempoAutomation?.keyframes ?? [];

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

    const resetChanges = useCallback(() => {
        if (
            keyframes.length <= 1 ||
            window.confirm('Reset all tempo changes after Bar 1? This cannot be undone here.')
        ) {
            resetTempoAutomationChanges();
        }
    }, [keyframes.length, resetTempoAutomationChanges]);

    return (
        <div className="border-t border-neutral-800">
            {/* Header row */}
            <div
                className="flex items-center justify-between gap-1 px-2 border-b border-neutral-800 bg-neutral-900 text-neutral-300"
                style={{ height: AUTOMATION_HEADER_HEIGHT }}
            >
                <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
                        Tempo map
                    </span>
                    {enabled && <span className="ml-1 text-[8px] text-amber-200/60">ACTIVE</span>}
                </div>
                <div className="flex items-center gap-1">
                    {enabled && (
                        <Button
                            variant="ghost"
                            size="full"
                            className="px-1.5 py-0.5 text-[9px]"
                            onClick={toggleVisible}
                            title={laneVisible ? 'Hide tempo lane' : 'Show tempo lane'}
                        >
                            {laneVisible ? 'Hide' : 'Show'}
                        </Button>
                    )}
                    {enabled && keyframes.length > 1 && (
                        <Button
                            variant="ghost"
                            size="full"
                            className="px-1.5 py-0.5 text-[9px] hover:text-red-300"
                            onClick={resetChanges}
                            title="Remove all tempo changes after Bar 1"
                        >
                            Reset
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="full"
                        className={`px-1.5 py-0.5 text-[9px] ${enabled ? 'bg-neutral-800 text-amber-300' : ''}`}
                        onClick={toggleEnabled}
                        title={enabled ? 'Disable tempo automation (keeps this tempo map)' : 'Enable tempo automation'}
                    >
                        {enabled ? 'Disable' : 'Enable'}
                    </Button>
                </div>
            </div>
            {/* Lane spacer (synced with right column lane height) */}
            {enabled && laneVisible && <TempoRangeControls />}
        </div>
    );
};

export default TempoLaneHeader;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from './TransportControls';
import TrackList from './tracks/TrackList';
import TrackLanes from './tracks/TrackLanes';
import TimelineRuler from './TimelineRuler';
import { useVisualizer } from '@context/VisualizerContext';
import { beatsToSeconds } from '@core/timing/tempo-utils';
import { FaPlus, FaCircle } from 'react-icons/fa';
import { MidiImportModeModal } from '@workspace/modals/MidiImportModeModal';
import { MidiTempoImportModal } from '@workspace/modals/MidiTempoImportModal';
import { CurveHeightProvider } from './context/curveHeightContext';
import { CurveRangeProvider } from './context/curveRangeContext';
import TimeIndicator from './header/TimeIndicator';
import HeaderRightControls from './header/HeaderRightControls';
import { useImportModals } from './hooks/useImportModals';
import { useMidiImport } from './hooks/useMidiImport';
import { useAudioImport } from './hooks/useAudioImport';
import { useFileDrop } from './hooks/useFileDrop';
import { useRowHeightSync } from './hooks/useRowHeightSync';
import { useTimelineNavigation } from './hooks/useTimelineNavigation';
import { useTimelinePointerControls } from './hooks/useTimelinePointerControls';
import { useAutoFollow } from './hooks/useAutoFollow';

const TimelinePanel: React.FC = () => {
    const { visualizer } = useVisualizer();
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const [activeTab, setActiveTab] = useState<'clips' | 'automation'>('clips');
    const autoKeying = useTimelineStore((s) => s.transport.autoKeying);
    const setAutoKeying = useTimelineStore((s) => s.setAutoKeying);
    const [follow, setFollow] = useState(true);

    // Import modal prompt/resolve pattern
    const {
        multiTrackPrompt, requestImportMode, resolveImportMode,
        tempoImportPrompt, requestTempoImport, resolveTempoImport,
    } = useImportModals();

    // File import
    const { fileRef, importMidiFile, handleAddFile } = useMidiImport({ requestImportMode, requestTempoImport });
    const { audioFileRef, importAudioFile, handleAddAudio } = useAudioImport();

    // Drag-and-drop overlay
    const { isDragActive, onPanelDragEnter, onPanelDragOver, onPanelDragLeave, onPanelDrop, onPanelDropCapture } =
        useFileDrop({ importMidiFile, importAudioFile });

    // Layout
    const { timelineBodyRef } = useRowHeightSync({ activeTab, trackIds });

    // View navigation and keyboard shortcuts
    const { fitAll, zoomToSelection, centerOnPlayhead } = useTimelineNavigation();

    // Pointer/touch/wheel gesture controls
    const { lanesScrollRef, setRightPaneEl, onRightPointerDown, onRightPointerMove, onRightPointerUp } =
        useTimelinePointerControls();

    // Auto-follow playhead during playback
    useAutoFollow({ follow });

    // Sync visualizer play range on mount
    useEffect(() => {
        if (!visualizer) return;
        try {
            const { startTick, endTick } = useTimelineStore.getState().timelineView;
            const state = useTimelineStore.getState();
            const spb = 60 / (state.timeline.globalBpm || 120);
            const map = state.timeline.masterTempoMap;
            const toSec = (tick: number) => beatsToSeconds(map, tick / CANONICAL_PPQ, spb);
            visualizer.setPlayRange?.(toSec(startTick), toSec(endTick));
        } catch { }
    }, [visualizer]);

    // Suppress unused-variable warning; timeline subscription kept for reactivity
    void timeline;

    return (
        <>
            <div
                className="timeline-panel relative flex h-full flex-col"
                role="region"
                aria-label="Timeline panel"
                onDropCapture={onPanelDropCapture}
                onDragEnter={onPanelDragEnter}
                onDragOver={onPanelDragOver}
                onDragLeave={onPanelDragLeave}
                onDrop={onPanelDrop}
            >
                {/* Header: left add-track + time indicator, center transport, right view + loop + quantize */}
                <div className="timeline-header relative z-30 grid flex-none grid-cols-3 items-center border-b border-neutral-800 bg-neutral-900/40 px-2 py-1">
                    {/* Left: Add track buttons + time indicator */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="px-2 py-1 border border-neutral-700 rounded cursor-pointer text-xs font-medium bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1">
                                <FaPlus className="text-neutral-300" />
                                <span>MIDI</span>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".mid,.midi"
                                    multiple
                                    className="hidden"
                                    onChange={handleAddFile}
                                />
                            </label>
                            <label className="px-2 py-1 border border-emerald-700 rounded cursor-pointer text-xs font-medium bg-emerald-900/40 hover:bg-emerald-800/60 flex items-center gap-1" title="Add Audio Track (wav/mp3/ogg)">
                                <FaPlus className="text-emerald-300" />
                                <span>Audio</span>
                                <input
                                    ref={audioFileRef}
                                    type="file"
                                    accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
                                    className="hidden"
                                    onChange={handleAddAudio}
                                />
                            </label>
                        </div>
                        <TimeIndicator />
                    </div>
                    {/* Center: Auto-keying toggle + transport controls */}
                    <div className="flex items-center justify-center justify-self-center">
                        <button
                            aria-label={autoKeying ? 'Disable auto-keying' : 'Enable auto-keying'}
                            title={autoKeying ? 'Auto-keying: On (click to disable)' : 'Auto-keying: Off (click to enable)'}
                            onClick={() => setAutoKeying(!autoKeying)}
                            className={`px-2 py-1 rounded border border-neutral-700 flex items-center justify-center transition-colors mr-2 ${autoKeying
                                ? 'bg-red-600/70 text-white border-red-400/70'
                                : 'bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800/60'
                                }`}
                        >
                            <FaCircle className="text-[12px]" />
                        </button>
                        <TransportControls />
                    </div>
                    {/* Right: view controls with overflow menu */}
                    <div className="justify-self-end">
                        <HeaderRightControls
                            follow={follow}
                            setFollow={setFollow}
                            onFitAll={fitAll}
                            onZoomToSelection={zoomToSelection}
                            onCenterOnPlayhead={centerOnPlayhead}
                        />
                    </div>
                </div>
                <div ref={timelineBodyRef} className="timeline-body flex flex-1 items-stretch gap-0 overflow-hidden">
                    <CurveHeightProvider>
                        <CurveRangeProvider>
                            <div className="h-full w-full overflow-y-auto overflow-x-hidden">
                                <div className="flex min-h-full">
                                    <div className="tracklist-container relative z-10 w-60 shrink-0 border-r border-neutral-800 bg-neutral-900/40">
                                        <TrackList trackIds={trackIds} activeTab={activeTab} setActiveTab={setActiveTab} />
                                    </div>
                                    <div ref={(el) => setRightPaneEl(el)} className="flex flex-1 flex-col">
                                        <div className="sticky top-0 z-10">
                                            <TimelineRuler />
                                        </div>
                                        <div
                                            className="relative flex-1"
                                            ref={lanesScrollRef}
                                            style={{ touchAction: 'none' }}
                                            onPointerDown={onRightPointerDown}
                                            onPointerMove={onRightPointerMove}
                                            onPointerUp={onRightPointerUp}
                                        >
                                            <TrackLanes trackIds={trackIds} activeTab={activeTab} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CurveRangeProvider>
                    </CurveHeightProvider>
                </div>
                {isDragActive && (
                    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-blue-500/80 bg-blue-500/10 text-blue-100 text-sm font-semibold uppercase tracking-wide">
                        Drop MIDI or audio files to add tracks
                    </div>
                )}
            </div>
            <MidiImportModeModal
                open={!!multiTrackPrompt}
                fileName={multiTrackPrompt?.fileName ?? ''}
                tracks={multiTrackPrompt?.tracks ?? []}
                onCancel={() => resolveImportMode('cancel')}
                onImportSingle={() => resolveImportMode('single')}
                onImportSplit={() => resolveImportMode('split')}
            />
            <MidiTempoImportModal
                open={!!tempoImportPrompt}
                tempoChangeCount={tempoImportPrompt?.count ?? 0}
                hasExistingKeyframes={tempoImportPrompt?.hasExisting ?? false}
                onChoice={resolveTempoImport}
            />
        </>
    );
};

export default TimelinePanel;

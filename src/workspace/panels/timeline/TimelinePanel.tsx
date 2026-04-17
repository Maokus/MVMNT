import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    FloatingFocusManager,
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';
import { beatsToTicks, CANONICAL_PPQ } from '@core/timing/ppq';
import { useTimelineStore } from '@state/timelineStore';
import { selectTimeline } from '@selectors/timelineSelectors';
import TransportControls from '../TransportControls';
import TrackList from './TrackList';
import TrackLanes from './TrackLanes';
import TimelineRuler from './TimelineRuler';
import { RULER_HEIGHT, AUTOMATION_ROW_HEIGHT, AUTOMATION_HEADER_HEIGHT } from './constants';
import { useVisualizer } from '@context/VisualizerContext';
import { selectVisibleAutomationRowCount, selectAutomatedElements } from '@automation/selectors';
import { useSceneStore } from '@state/sceneStore';
// Seconds shown are derived from tick on the fly (legacy seconds selectors removed).
import { formatTickAsBBT } from '@core/timing/time-domain';
import { TimingManager } from '@core/timing';
import { beatsToSeconds } from '@core/timing/tempo-utils';
import { parseMIDIFileToData } from '@core/midi/midi-library';
import { splitMidiDataByTracks } from '@core/midi/midi-ingest';
import type { MIDIData, MIDITrackDetails } from '@core/types';
import { FaPlus, FaEllipsisV, FaMagnet, FaCircle, FaExpand, FaObjectGroup, FaCrosshairs, FaArrowRight, FaMagic } from 'react-icons/fa';
import { sharedTimingManager } from '@state/timelineStore';
import {
    formatQuantizeLabel,
    TIMELINE_SNAP_OPTIONS,
    type QuantizeSetting,
    type SnapQuantizeOption,
} from '@state/timeline/quantize';
import { MidiImportModeModal } from './MidiImportModeModal';
import { MidiTempoImportModal, type TempoImportChoice } from './MidiTempoImportModal';
import { midiTempoMapToKeyframes } from '@core/timing/midi-tempo-to-keyframes';
import { CANONICAL_PPQ as TIMING_PPQ } from '@core/timing/ppq';
import { CurveHeightProvider } from './curveHeightContext';
import { CurveRangeProvider } from './curveRangeContext';

const MIDI_FILE_REGEX = /\.mid(i)?$/i;
const AUDIO_FILE_REGEX = /\.(wav|mp3|ogg|flac|m4a|aac|aiff|aif|caf|opus|wma)$/i;

const isMidiFile = (file: File) => {
    const name = file.name?.toLowerCase?.() ?? '';
    const type = file.type?.toLowerCase?.() ?? '';
    return MIDI_FILE_REGEX.test(name) || type === 'audio/midi' || type === 'audio/x-midi';
};

const isAudioFile = (file: File) => {
    if (!file) return false;
    const type = file.type?.toLowerCase?.() ?? '';
    if (type.startsWith('audio/')) return true;
    const name = file.name?.toLowerCase?.() ?? '';
    return AUDIO_FILE_REGEX.test(name);
};

// --- Timeline navigation helpers (module-level) ---
const MIN_RANGE = 4; // 4 ticks (~1/120 beat at PPQ=480)
const MAX_RANGE = CANONICAL_PPQ * 60 * 10;

function isEditableTarget(el: Element | null): boolean {
    if (!el) return false;
    const tag = (el as HTMLElement).tagName;
    return (el as HTMLElement).isContentEditable
        || tag === 'INPUT'
        || tag === 'TEXTAREA'
        || (el as HTMLElement).getAttribute?.('role') === 'textbox';
}

/** Zoom the view around a pivot tick by `factor` (>1 = zoom out, <1 = zoom in). */
function zoomAround(startTick: number, endTick: number, pivotTick: number, factor: number) {
    const range = Math.max(1, endTick - startTick);
    const newRange = Math.max(MIN_RANGE, Math.min(MAX_RANGE, range * factor));
    const pivotFrac = Math.max(0, Math.min(1, (pivotTick - startTick) / range));
    const newStart = Math.round(pivotTick - pivotFrac * newRange);
    return { newStart, newEnd: Math.round(newStart + newRange) };
}

/** Return the last content tick across all tracks (MIDI + audio). */
function getContentEndTick(state: ReturnType<typeof useTimelineStore.getState>): number {
    let maxTick = 0;
    for (const id of state.tracksOrder) {
        const track = state.tracks[id] as any;
        if (!track) continue;
        const offset: number = track.offsetTicks ?? 0;
        if (track.midiSourceId) {
            const cache = state.midiCache[track.midiSourceId];
            if (cache?.notesRaw?.length) {
                const last = cache.notesRaw[cache.notesRaw.length - 1];
                maxTick = Math.max(maxTick, offset + last.endTick);
            }
        } else {
            const entry = (state as any).audioCache?.[id];
            if (entry?.durationTicks) {
                maxTick = Math.max(maxTick, offset + entry.durationTicks);
            }
        }
    }
    return maxTick;
}

type MultiTrackChoice = 'single' | 'split' | 'cancel';

interface MultiTrackDecisionState {
    fileName: string;
    midiData: MIDIData;
    tracks: MIDITrackDetails[];
}

const TimelinePanel: React.FC = () => {
    const { visualizer } = useVisualizer();
    const timeline = useTimelineStore(selectTimeline);
    const order = useTimelineStore((s) => s.tracksOrder);
    const tracksMap = useTimelineStore((s) => s.tracks);
    const addMidiTrack = useTimelineStore((s) => s.addMidiTrack);
    const addAudioTrack = useTimelineStore((s) => s.addAudioTrack);
    const trackIds = useMemo(() => order.filter((id) => !!tracksMap[id]), [order, tracksMap]);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const audioFileRef = useRef<HTMLInputElement | null>(null);
    const [multiTrackPrompt, setMultiTrackPrompt] = useState<MultiTrackDecisionState | null>(null);
    const multiTrackResolverRef = useRef<((choice: MultiTrackChoice) => void) | null>(null);
    const [tempoImportPrompt, setTempoImportPrompt] = useState<{ count: number; hasExisting: boolean } | null>(null);
    const tempoImportResolverRef = useRef<((choice: TempoImportChoice) => void) | null>(null);
    const dragCounterRef = useRef(0);
    const [isDragActive, setIsDragActive] = useState(false);
    const [activeTab, setActiveTab] = useState<'clips' | 'automation'>('clips');

    const requestImportMode = useCallback(
        (info: MultiTrackDecisionState) =>
            new Promise<MultiTrackChoice>((resolve) => {
                multiTrackResolverRef.current = resolve;
                setMultiTrackPrompt(info);
            }),
        [],
    );

    const resolveImportMode = useCallback((choice: MultiTrackChoice) => {
        const resolver = multiTrackResolverRef.current;
        multiTrackResolverRef.current = null;
        setMultiTrackPrompt(null);
        if (resolver) resolver(choice);
    }, []);

    const requestTempoImport = useCallback(
        (count: number, hasExisting: boolean) =>
            new Promise<TempoImportChoice>((resolve) => {
                tempoImportResolverRef.current = resolve;
                setTempoImportPrompt({ count, hasExisting });
            }),
        [],
    );

    const resolveTempoImport = useCallback((choice: TempoImportChoice) => {
        const resolver = tempoImportResolverRef.current;
        tempoImportResolverRef.current = null;
        setTempoImportPrompt(null);
        if (resolver) resolver(choice);
    }, []);

    useEffect(() => {
        return () => {
            if (multiTrackResolverRef.current) {
                multiTrackResolverRef.current('cancel');
                multiTrackResolverRef.current = null;
            }
            if (tempoImportResolverRef.current) {
                tempoImportResolverRef.current('skip');
                tempoImportResolverRef.current = null;
            }
        };
    }, []);
    useEffect(() => {
        const resetDragState = () => {
            dragCounterRef.current = 0;
            setIsDragActive(false);
        };
        window.addEventListener('drop', resetDragState);
        window.addEventListener('dragend', resetDragState);
        return () => {
            window.removeEventListener('drop', resetDragState);
            window.removeEventListener('dragend', resetDragState);
        };
    }, []);
    // Scroll containers for sync
    const lanesScrollRef = useRef<HTMLDivElement | null>(null);
    const lanesScrollEl = lanesScrollRef.current;
    const timelineBodyRef = useRef<HTMLDivElement | null>(null);
    const [bodyHeight, setBodyHeight] = useState(0);
    const rowHeight = useTimelineStore((s) => s.rowHeight);
    const setRowHeight = useTimelineStore((s) => s.setRowHeight);
    const trackCount = trackIds.length;
    const automationRowCount = useSceneStore(selectVisibleAutomationRowCount);
    const hasAutomation = useSceneStore(useCallback((s) => selectAutomatedElements(s).length > 0, []));

    useLayoutEffect(() => {
        const el = timelineBodyRef.current;
        if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setBodyHeight(Math.max(0, Math.round(rect.height)));
        };
        update();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => update());
            observer.observe(el);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    useEffect(() => {
        if (bodyHeight <= RULER_HEIGHT) return;
        if (activeTab === 'clips') {
            if (!trackCount) return;
            const usable = bodyHeight - RULER_HEIGHT;
            if (usable <= 0) return;
            const desired = usable / trackCount;
            const clamped = Math.max(16, Math.min(160, desired));
            if (Math.abs(clamped - rowHeight) > 0.5) {
                setRowHeight(clamped);
            }
        }
    }, [bodyHeight, trackCount, rowHeight, setRowHeight, automationRowCount, hasAutomation, activeTab]);

    useEffect(() => {
        const el = lanesScrollEl;
        if (!el) return;
        const handleScroll = () => {
            const scrollLeft = el.scrollLeft;
            if (Math.abs(scrollLeft) < 1) {
                el.scrollLeft = 0;
                return;
            }
            const width = el.clientWidth || 1;
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const range = Math.max(1, endTick - startTick);
            if (!range) {
                el.scrollLeft = 0;
                return;
            }
            const shift = Math.round((scrollLeft / width) * range);
            if (shift !== 0) {
                state.setTimelineViewTicks(startTick + shift, endTick + shift);
            }
            el.scrollLeft = 0;
        };
        el.addEventListener('scroll', handleScroll);
        return () => {
            el.removeEventListener('scroll', handleScroll);
        };
    }, [lanesScrollEl]);

    const importMidiFile = useCallback(
        async (file: File) => {
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            let midiData: MIDIData;
            try {
                midiData = await parseMIDIFileToData(file);
            } catch (error) {
                console.error('Failed to parse MIDI file', error);
                alert(`Unable to read ${file.name}. Please verify the file is a valid MIDI.`);
                return false;
            }

            // Check for tempo changes in the MIDI file
            const midiTempoMap = (midiData as any).tempoMap as Array<{ time: number; tempo: number }> | undefined;
            if (midiTempoMap && midiTempoMap.length > 1) {
                try {
                    const tempoEntries = midiTempoMap.map((t) => ({ time: t.time, tempo: t.tempo }));
                    const converted = midiTempoMapToKeyframes(tempoEntries, TIMING_PPQ);
                    const existingTa = useTimelineStore.getState().timeline.tempoAutomation;
                    const hasExisting = !!(existingTa?.enabled && existingTa.keyframes.length > 0);
                    const tempoChoice = await requestTempoImport(converted.length, hasExisting);
                    if (tempoChoice === 'replace') {
                        const api = useTimelineStore.getState();
                        if (!api.timeline.tempoAutomation?.enabled) api.enableTempoAutomation();
                        api.batchSetTempoKeyframes(converted);
                    } else if (tempoChoice === 'merge' && hasExisting) {
                        const api = useTimelineStore.getState();
                        const existing = api.timeline.tempoAutomation?.keyframes ?? [];
                        // Merge: existing keyframes take precedence at same tick
                        const existingTicks = new Set(existing.map((kf) => kf.tick));
                        const merged = [...existing, ...converted.filter((kf) => !existingTicks.has(kf.tick))];
                        merged.sort((a, b) => a.tick - b.tick);
                        api.batchSetTempoKeyframes(merged);
                    }
                } catch (err) {
                    console.error('Failed to process MIDI tempo map', err);
                }
            }

            const details = midiData.trackDetails ?? [];
            const playableTracks = details.length ? details : [];
            if (playableTracks.length <= 1) {
                const detailName = playableTracks[0]?.name?.trim();
                const trackName = detailName && detailName.length ? detailName : baseName;
                await addMidiTrack({ name: trackName, midiData });
                return true;
            }
            const choice = await requestImportMode({
                fileName: file.name,
                midiData,
                tracks: playableTracks,
            });
            if (choice === 'cancel') return false;
            if (choice === 'single') {
                await addMidiTrack({ name: baseName, midiData });
                return true;
            }
            const splits = splitMidiDataByTracks(midiData);
            if (!splits.length) {
                await addMidiTrack({ name: baseName, midiData });
                return true;
            }
            for (let index = 0; index < splits.length; index++) {
                const entry = splits[index];
                const labelCandidate = entry.track.name?.trim();
                const trackName = labelCandidate && labelCandidate.length
                    ? labelCandidate
                    : `${baseName} - Track ${index + 1}`;
                await addMidiTrack({ name: trackName, midiData: entry.data });
            }
            return true;
        },
        [addMidiTrack, requestImportMode, requestTempoImport],
    );

    const handleAddFile = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            if (fileRef.current) fileRef.current.value = '';
            for (const file of files) {
                await importMidiFile(file);
            }
        },
        [importMidiFile],
    );

    const importAudioFile = useCallback(
        async (file: File) => {
            if (isMidiFile(file)) {
                alert('MIDI files are not allowed for audio tracks. Please use an audio file (wav, mp3, ogg, flac, m4a).');
                return false;
            }
            if (!isAudioFile(file)) {
                alert('Unsupported file type. Please select an audio file.');
                return false;
            }
            const name = file.name.replace(/\.[^/.]+$/, '');
            try {
                await addAudioTrack({ name, file });
                return true;
            } catch (error) {
                console.error('Failed to import audio track', error);
                const reason = error instanceof Error ? error.message : 'The format may be unsupported or the file may be corrupted.';
                alert(`Unable to import ${file.name}. ${reason}`);
                return false;
            }
        },
        [addAudioTrack],
    );

    const handleAddAudio = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files ?? []);
            if (!files.length) return;
            for (const file of files) {
                await importAudioFile(file);
            }
            if (audioFileRef.current) audioFileRef.current.value = '';
        },
        [importAudioFile],
    );

    const handleDroppedFiles = useCallback(
        async (files: File[]) => {
            if (!files.length) return;
            const unique: File[] = [];
            const seen = new Set<string>();
            for (const file of files) {
                const key = `${file.name}__${file.size}__${file.lastModified}__${file.type}`;
                if (seen.has(key)) continue;
                seen.add(key);
                unique.push(file);
            }
            if (!unique.length) return;
            const midiFiles: File[] = [];
            const audioFiles: File[] = [];
            for (const file of unique) {
                if (isMidiFile(file)) {
                    midiFiles.push(file);
                    continue;
                }
                if (isAudioFile(file)) {
                    audioFiles.push(file);
                }
            }
            for (const midi of midiFiles) {
                await importMidiFile(midi);
            }
            for (const audio of audioFiles) {
                await importAudioFile(audio);
            }
            const ignored = unique.length - midiFiles.length - audioFiles.length;
            if (ignored > 0) {
                alert(`Ignored ${ignored} file${ignored > 1 ? 's' : ''}. Only MIDI (.mid/.midi) and common audio formats are supported.`);
            }
        },
        [importMidiFile, importAudioFile],
    );

    const hasFiles = useCallback((dt: DataTransfer | null) => {
        if (!dt) return false;
        if (dt.items && dt.items.length) {
            return Array.from(dt.items).some((item) => item.kind === 'file');
        }
        if (dt.files && dt.files.length) return true;
        const types = dt.types ? Array.from(dt.types) : [];
        return types.includes('Files');
    }, []);

    const onPanelDragEnter = useCallback<React.DragEventHandler<HTMLDivElement>>(
        (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current += 1;
            setIsDragActive(true);
        },
        [hasFiles],
    );

    const onPanelDragOver = useCallback<React.DragEventHandler<HTMLDivElement>>(
        (e) => {
            if (!isDragActive && !hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        },
        [hasFiles, isDragActive],
    );

    const onPanelDragLeave = useCallback<React.DragEventHandler<HTMLDivElement>>(
        (e) => {
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
            if (dragCounterRef.current === 0) {
                setIsDragActive(false);
            }
        },
        [hasFiles],
    );

    const onPanelDrop = useCallback<React.DragEventHandler<HTMLDivElement>>(
        (e) => {
            // Always clear overlay state on drop, even if the browser doesn't expose file items.
            dragCounterRef.current = 0;
            setIsDragActive(false);
            console.log("set is drag active false");
            if (!hasFiles(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer.files ?? []);
            if (!files.length) return;
            void handleDroppedFiles(files);
        },
        [hasFiles, handleDroppedFiles],
    );

    const onPanelDropCapture = useCallback<React.DragEventHandler<HTMLDivElement>>(() => {
        // Ensure the overlay clears even when a child drop handler stops propagation.
        dragCounterRef.current = 0;
        setIsDragActive(false);
    }, []);

    // Optional: on mount, nudge visualizer play range to current ruler state (no-op when already synced)
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

    // Wheel pan handler on the right container (zoom removed; only horizontal pan via deltaX)
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const view = useTimelineStore((s) => s.timelineView); // contains startTick/endTick canonical
    const isPlaying = useTimelineStore((s) => s.transport.isPlaying);
    // Derived seconds still used for display-only follow heuristics optional; canonical follow in ticks
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    // Auto Keying
    const autoKeying = useTimelineStore((s) => s.transport.autoKeying);
    const setAutoKeying = useTimelineStore((s) => s.setAutoKeying);
    // Auto-follow enabled by default per new UX spec
    const [follow, setFollow] = useState(true);
    // Quantize state tracked here for the 's' hotkey
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const lastSnapRef = useRef<QuantizeSetting>('bar');
    useEffect(() => { if (quantize !== 'off') lastSnapRef.current = quantize; }, [quantize]);
    const rightDragRef = useRef<{ active: boolean; startClientX: number; startView: { s: number; e: number } } | null>(null);
    const [rightPaneEl, setRightPaneEl] = useState<HTMLDivElement | null>(null);
    const spaceDownRef = useRef(false);
    const isPointerDownRef = useRef(false);
    const spaceDragRef = useRef<{ startClientX: number; startView: { s: number; e: number } } | null>(null);
    const activePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
    const pinchRef = useRef<{ dist: number; startView: { s: number; e: number }; pivotTick: number } | null>(null);

    const onRightPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

        // Middle button — drag to pan
        if (e.button === 1) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            rightDragRef.current = { active: true, startClientX: e.clientX, startView: { s: view.startTick, e: view.endTick } };
            e.preventDefault();
            return;
        }

        // Pinch: second pointer arrived — record pinch start state
        if (activePointersRef.current.size >= 2) {
            const pts = [...activePointersRef.current.values()];
            const dx = pts[0].clientX - pts[1].clientX;
            const dy = pts[0].clientY - pts[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const centerClientX = (pts[0].clientX + pts[1].clientX) / 2;
            const container = lanesScrollRef.current;
            const rect = container?.getBoundingClientRect();
            const pivotFrac = rect ? (centerClientX - rect.left) / Math.max(1, rect.width) : 0.5;
            const pivotTick = view.startTick + pivotFrac * (view.endTick - view.startTick);
            pinchRef.current = { dist, startView: { s: view.startTick, e: view.endTick }, pivotTick };
            return;
        }

        // Left button + Space held — space-drag pan
        if (e.button === 0) {
            isPointerDownRef.current = true;
            if (spaceDownRef.current) {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                spaceDragRef.current = { startClientX: e.clientX, startView: { s: view.startTick, e: view.endTick } };
                e.preventDefault();
            }
        }
    };

    const onRightPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

        // Middle-button drag pan
        const drag = rightDragRef.current;
        if (drag?.active) {
            const container = lanesScrollRef.current;
            if (!container) return;
            const width = Math.max(1, container.getBoundingClientRect().width);
            const range = Math.max(1, drag.startView.e - drag.startView.s);
            const shift = Math.round(((e.clientX - drag.startClientX) / width) * range);
            setTimelineViewTicks(drag.startView.s - shift, drag.startView.e - shift);
            return;
        }

        // Space-drag pan
        const spaceDrag = spaceDragRef.current;
        if (spaceDrag) {
            const container = lanesScrollRef.current;
            if (!container) return;
            const width = Math.max(1, container.getBoundingClientRect().width);
            const range = Math.max(1, spaceDrag.startView.e - spaceDrag.startView.s);
            const shift = Math.round((-(e.clientX - spaceDrag.startClientX) / width) * range);
            setTimelineViewTicks(spaceDrag.startView.s + shift, spaceDrag.startView.e + shift);
            return;
        }

        // Pinch-to-zoom
        const pinch = pinchRef.current;
        if (pinch && activePointersRef.current.size >= 2) {
            const pts = [...activePointersRef.current.values()];
            const dx = pts[0].clientX - pts[1].clientX;
            const dy = pts[0].clientY - pts[1].clientY;
            const newDist = Math.sqrt(dx * dx + dy * dy);
            const factor = pinch.dist / Math.max(1, newDist); // smaller dist = zoom in = smaller factor
            const { newStart, newEnd } = zoomAround(pinch.startView.s, pinch.startView.e, pinch.pivotTick, factor);
            setTimelineViewTicks(newStart, newEnd);
        }
    };

    const onRightPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        activePointersRef.current.delete(e.pointerId);

        if (rightDragRef.current?.active) {
            rightDragRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        }
        if (spaceDragRef.current) {
            spaceDragRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { }
        }
        if (activePointersRef.current.size < 2) {
            pinchRef.current = null;
        }
        if (e.button === 0) {
            isPointerDownRef.current = false;
        }
    };

    // Native non-passive wheel handler — covers ruler + lanes; prevents browser back-navigation on horizontal swipe
    useEffect(() => {
        if (!rightPaneEl) return;
        const handleWheel = (e: WheelEvent) => {
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const range = Math.max(1, endTick - startTick);
            const rect = rightPaneEl.getBoundingClientRect();
            const width = Math.max(1, rect.width);

            if (e.ctrlKey || e.metaKey) {
                // Cmd/Ctrl + scroll → zoom around cursor; always consume
                e.preventDefault();
                const cursorFrac = (e.clientX - rect.left) / width;
                const pivotTick = startTick + cursorFrac * range;
                const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
                const { newStart, newEnd } = zoomAround(startTick, endTick, pivotTick, factor);
                state.setTimelineViewTicks(newStart, newEnd);
            } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                // Horizontal scroll dominates → pan the timeline; consume to prevent browser navigation
                e.preventDefault();
                const shift = Math.round((e.deltaX / width) * range);
                if (shift !== 0) {
                    state.setTimelineViewTicks(startTick + shift, endTick + shift);
                }
            }
            // Vertical-dominant scroll → do not preventDefault; let the container scroll normally
        };
        rightPaneEl.addEventListener('wheel', handleWheel, { passive: false });
        return () => rightPaneEl.removeEventListener('wheel', handleWheel);
    }, [rightPaneEl]);

    // View preset callbacks
    const fitAll = useCallback(() => {
        const state = useTimelineStore.getState();
        const endTick = getContentEndTick(state);
        const finalEnd = Math.max(endTick, CANONICAL_PPQ * 8);
        const padding = (finalEnd - 0) * 0.05;
        setTimelineViewTicks(Math.round(-padding), Math.round(finalEnd + padding));
    }, [setTimelineViewTicks]);

    const zoomToSelection = useCallback(() => {
        const state = useTimelineStore.getState();
        const selectedIds = state.selection.selectedTrackIds;
        const selectedKeyframes = useSceneStore.getState().interaction.automationSelectedKeyframes;

        if (!selectedIds.length && !selectedKeyframes.length) return;

        let minTick = Infinity, maxTick = -Infinity;

        for (const id of selectedIds) {
            const track = state.tracks[id] as any;
            if (!track) continue;
            const offset: number = track.offsetTicks ?? 0;
            if (track.midiSourceId) {
                const cache = state.midiCache[track.midiSourceId];
                if (cache?.notesRaw?.length) {
                    minTick = Math.min(minTick, offset);
                    maxTick = Math.max(maxTick, offset + cache.notesRaw[cache.notesRaw.length - 1].endTick);
                }
            } else {
                const entry = (state as any).audioCache?.[id];
                if (entry?.durationTicks) {
                    minTick = Math.min(minTick, offset);
                    maxTick = Math.max(maxTick, offset + entry.durationTicks);
                }
            }
        }

        for (const { tick } of selectedKeyframes) {
            minTick = Math.min(minTick, tick);
            maxTick = Math.max(maxTick, tick);
        }

        if (!isFinite(minTick) || !isFinite(maxTick)) return;
        const padding = Math.max(CANONICAL_PPQ, (maxTick - minTick) * 0.1);
        setTimelineViewTicks(Math.round(minTick - padding), Math.round(maxTick + padding));
    }, [setTimelineViewTicks]);

    const centerOnPlayhead = useCallback(() => {
        const state = useTimelineStore.getState();
        const { startTick, endTick } = state.timelineView;
        const range = Math.max(1, endTick - startTick);
        const tick = state.timeline.currentTick;
        setTimelineViewTicks(Math.round(tick - range / 2), Math.round(tick + range / 2));
    }, [setTimelineViewTicks]);

    const frameSelection = useCallback(() => {
        const state = useTimelineStore.getState();
        if (state.selection.selectedTrackIds.length) {
            zoomToSelection();
        } else {
            centerOnPlayhead();
        }
    }, [zoomToSelection, centerOnPlayhead]);

    // Space key tracking — allows space-drag pan while preventing conflict with play/pause
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            if (isEditableTarget(document.activeElement)) return;
            spaceDownRef.current = true;
            // If a left-button drag is already active, consume space so transport doesn't toggle play
            if (isPointerDownRef.current) {
                e.stopImmediatePropagation();
                e.preventDefault();
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            spaceDownRef.current = false;
            spaceDragRef.current = null;
        };
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    // Timeline navigation keyboard shortcuts
    useEffect(() => {
        const ZOOM_STEP = 1.3;
        const handler = (e: KeyboardEvent) => {
            if (isEditableTarget(document.activeElement)) return;
            const state = useTimelineStore.getState();
            const { startTick, endTick } = state.timelineView;
            const center = (startTick + endTick) / 2;

            switch (e.key) {
                // zoom in: + or = (same physical key without/with shift)
                case '+':
                case '=': {
                    const { newStart, newEnd } = zoomAround(startTick, endTick, center, 1 / ZOOM_STEP);
                    state.setTimelineViewTicks(newStart, newEnd);
                    e.preventDefault();
                    break;
                }
                // zoom out: -
                case '-': {
                    const { newStart, newEnd } = zoomAround(startTick, endTick, center, ZOOM_STEP);
                    state.setTimelineViewTicks(newStart, newEnd);
                    e.preventDefault();
                    break;
                }
                // Shift+1 → fit all
                case '!':
                    if (e.shiftKey) { fitAll(); e.preventDefault(); }
                    break;
                // Shift+2 → zoom to selection
                case '@':
                    if (e.shiftKey) { zoomToSelection(); e.preventDefault(); }
                    break;
                // F → frame selection or playhead
                case 'f':
                case 'F':
                    frameSelection();
                    e.preventDefault();
                    break;
                // S → toggle snapping on/off
                case 's':
                case 'S': {
                    const snapState = useTimelineStore.getState();
                    const q = snapState.transport.quantize;
                    snapState.setQuantize(q !== 'off' ? 'off' : lastSnapRef.current);
                    e.preventDefault();
                    break;
                }
                // Arrow keys → nudge playhead (skip if a scene element nudge already handled it)
                // Skip if Ctrl/Cmd are pressed (reserved for single-tick step in useTransportBridge)
                case 'ArrowLeft':
                case 'ArrowRight': {
                    if (e.defaultPrevented || e.ctrlKey || e.metaKey) break;
                    const nudge = e.shiftKey
                        ? CANONICAL_PPQ * (state.timeline.beatsPerBar || 4) // 1 bar
                        : CANONICAL_PPQ; // 1 beat
                    const dir = e.key === 'ArrowLeft' ? -1 : 1;
                    const next = Math.max(0, state.timeline.currentTick + dir * nudge);
                    state.seekTick(next);
                    e.preventDefault();
                    break;
                }
                default:
                    break;
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
    }, [fitAll, zoomToSelection, frameSelection]);

    // Keyboard: Delete key removes all currently selected tracks (batch) when focus isn't in a text-editable field.
    useEffect(() => {
        const removeTracks = useTimelineStore.getState().removeTracks;
        const getSelection = () => useTimelineStore.getState().selection.selectedTrackIds;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (isEditableTarget(document.activeElement)) return;
            const ids = getSelection();
            if (!ids.length) return;
            removeTracks(ids);
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true } as any);
    }, []);

    // Prevent browser gesture zoom on Safari within the panel to avoid page zoom side-effects
    useEffect(() => {
        const el = lanesScrollRef.current;
        if (!el) return;
        const prevent = (ev: Event) => {
            ev.preventDefault();
        };
        el.addEventListener('gesturestart', prevent as EventListener, { passive: false } as any);
        el.addEventListener('gesturechange', prevent as EventListener, { passive: false } as any);
        el.addEventListener('gestureend', prevent as EventListener, { passive: false } as any);
        return () => {
            el.removeEventListener('gesturestart', prevent as EventListener);
            el.removeEventListener('gesturechange', prevent as EventListener);
            el.removeEventListener('gestureend', prevent as EventListener);
        };
    }, []);

    // Optional auto-follow playhead: keep playhead within view, nudging the window when it exits right 85% or left 10%
    useEffect(() => {
        if (!follow || !isPlaying) return;
        const range = Math.max(1, view.endTick - view.startTick);
        const left = view.startTick + range * 0.1;
        const right = view.startTick + range * 0.85;
        if (currentTick < left) {
            const newStart = currentTick - range * 0.3;
            setTimelineViewTicks(newStart, newStart + range);
        } else if (currentTick > right) {
            const newStart = currentTick - range * 0.7;
            setTimelineViewTicks(newStart, newStart + range);
        }
    }, [currentTick, follow, isPlaying, view.startTick, view.endTick, setTimelineViewTicks]);


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
                    {/* Left: Add track */}
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
                    {/* Center */}
                    <div className="flex items-center justify-center justify-self-center">
                        {/* Auto-keying toggle */}
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
                    {/* Right: timeline view controls with overflow menu */}
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

// Time indicator component (moved to the left header beside Add MIDI Track)
const TimeIndicator: React.FC = () => {
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const tempoMap = useTimelineStore((s) => s.timeline.masterTempoMap);
    const bpm = useTimelineStore((s) => s.timeline.globalBpm);
    // Use TimingManager for canonical ticksPerQuarter instead of hard-coded constant (was 960 vs core 480 mismatch)
    // Use shared timing manager (singleton) for consistent tick domain
    const ticksPerQuarter = sharedTimingManager.ticksPerQuarter;
    // Derive beats/seconds from tick
    const beatsFloat = currentTick / ticksPerQuarter;
    const barsFloat = beatsFloat / (beatsPerBar || 4);
    // seconds derivation using fallback tempo map util (simplified uniform tempo assumption if no map)
    const spb = 60 / (bpm || 120);
    let seconds = beatsFloat * spb;
    // Use TimingManager for accurate beats->seconds with tempo map if available
    try {
        if (tempoMap && tempoMap.length) {
            // Reuse shared timing manager (already has BPM/tempo map set via store actions)
            seconds = sharedTimingManager.beatsToSeconds(beatsFloat);
        }
    } catch { /* ignore */ }
    const fmt = (s: number) => {
        const sign = s < 0 ? '-' : '';
        const abs = Math.abs(s);
        const m = Math.floor(abs / 60);
        const sec = Math.floor(abs % 60);
        const ms = Math.floor((abs * 1000) % 1000);
        return `${sign}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms
            .toString()
            .padStart(3, '0')}`;
    };
    return (
        <div className="flex items-center gap-2 text-[12px] text-neutral-400 select-none">
            <span>{formatTickAsBBT(currentTick, ticksPerQuarter, beatsPerBar)}</span>
            <span className="hidden sm:inline">({fmt(seconds)})</span>
            <span className="hidden sm:inline whitespace-nowrap">beats: {beatsFloat.toFixed(2)}</span>
            <span className="hidden sm:inline whitespace-nowrap">bars: {barsFloat.toFixed(2)}</span>
        </div>
    );
};

// Right-side header controls: zoom slider, view presets, quantize toggle, follow
const HeaderRightControls: React.FC<{
    follow?: boolean;
    setFollow?: (v: boolean) => void;
    onFitAll?: () => void;
    onZoomToSelection?: () => void;
    onCenterOnPlayhead?: () => void;
}> = ({ follow, setFollow, onFitAll, onZoomToSelection, onCenterOnPlayhead }) => {
    const view = useTimelineStore((s) => s.timelineView);
    const setTimelineViewTicks = useTimelineStore((s) => s.setTimelineViewTicks);
    const quantize = useTimelineStore((s) => s.transport.quantize);
    const setQuantize = useTimelineStore((s) => s.setQuantize);
    const adaptiveSnap = useTimelineStore((s) => s.transport.adaptiveSnap);
    const setAdaptiveSnap = useTimelineStore((s) => s.setAdaptiveSnap);
    const lastNonOffQuantizeRef = useRef<QuantizeSetting>('bar');
    useEffect(() => {
        if (quantize !== 'off') {
            lastNonOffQuantizeRef.current = quantize;
        }
    }, [quantize]);
    const magnetActive = quantize !== 'off';
    const currentQuantizeLabel = formatQuantizeLabel(quantize);
    const pendingQuantizeLabel = formatQuantizeLabel(lastNonOffQuantizeRef.current);
    const snapSelectValue = (magnetActive ? quantize : lastNonOffQuantizeRef.current) as SnapQuantizeOption;
    // Global timing state
    const globalBpm = useTimelineStore((s) => s.timeline.globalBpm);
    const beatsPerBar = useTimelineStore((s) => s.timeline.beatsPerBar);
    const setGlobalBpm = useTimelineStore((s) => s.setGlobalBpm);
    const setBeatsPerBar = useTimelineStore((s) => s.setBeatsPerBar);
    const tempoAutomationEnabled = useTimelineStore((s) => !!s.timeline.tempoAutomation?.enabled);
    // When tempo automation is enabled, derive the instantaneous BPM at the playhead
    const currentTick = useTimelineStore((s) => s.timeline.currentTick);
    const displayBpm = useMemo(() => {
        if (!tempoAutomationEnabled) return globalBpm;
        try {
            const tm = sharedTimingManager;
            if (!tm) return globalBpm;
            const sec = tm.ticksToSeconds(currentTick);
            const spb = tm.getSecondsPerBeat(sec);
            if (spb > 0) return Math.round(60 / spb * 10) / 10;
        } catch { }
        return globalBpm;
    }, [tempoAutomationEnabled, currentTick, globalBpm]);
    const [menuOpen, setMenuOpen] = useState(false);
    const {
        refs: menuRefs,
        floatingStyles: menuFloatingStyles,
        context: menuContext,
    } = useFloating({
        open: menuOpen,
        onOpenChange: setMenuOpen,
        placement: 'top-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    });
    const menuDismiss = useDismiss(menuContext, { outsidePressEvent: 'mousedown' });
    const menuRole = useRole(menuContext, { role: 'menu' });
    const { getReferenceProps: getMenuReferenceProps, getFloatingProps: getMenuFloatingProps } = useInteractions([
        menuDismiss,
        menuRole,
    ]);
    // Zoom slider state maps to view range width using logarithmic scale
    const range = Math.max(1, view.endTick - view.startTick);
    const sliderFromRange = (r: number) => {
        const t = (Math.log(r) - Math.log(MIN_RANGE)) / (Math.log(MAX_RANGE) - Math.log(MIN_RANGE));
        const clamped = Math.max(0, Math.min(1, t));
        return Math.round(clamped * 100);
    };
    const rangeFromSlider = (v: number) => {
        const t = Math.max(0, Math.min(1, v / 100));
        const logR = Math.log(MIN_RANGE) + t * (Math.log(MAX_RANGE) - Math.log(MIN_RANGE));
        return Math.exp(logR);
    };
    const [zoomVal, setZoomVal] = useState<number>(() => sliderFromRange(range));
    useEffect(() => { setZoomVal(sliderFromRange(range)); }, [range]);

    // Local editable buffers so typing isn't instantly overwritten by store updates
    const [localTempo, setLocalTempo] = useState<string>('');
    const [localBeatsPerBar, setLocalBeatsPerBar] = useState<string>('');
    useEffect(() => {
        const v = tempoAutomationEnabled ? displayBpm : globalBpm;
        setLocalTempo(String(Number.isFinite(v) ? v : 120));
    }, [globalBpm, tempoAutomationEnabled, displayBpm]);
    useEffect(() => { setLocalBeatsPerBar(String(Number.isFinite(beatsPerBar) ? beatsPerBar : 4)); }, [beatsPerBar]);
    const commitTempo = () => {
        const v = parseFloat(localTempo);
        const value = Number.isFinite(v) && v > 0 ? v : (Number.isFinite(globalBpm) ? globalBpm : 120);
        try { setGlobalBpm(value); } catch { }
        setLocalTempo(String(value));
    };
    const commitBeatsPerBar = () => {
        const v = parseInt(localBeatsPerBar);
        const value = Number.isFinite(v) && v > 0 ? Math.floor(v) : (Number.isFinite(beatsPerBar) ? beatsPerBar : 4);
        try { setBeatsPerBar(value); } catch { }
        setLocalBeatsPerBar(String(value));
    };

    return (
        <div className="flex items-center gap-3 text-[12px] relative">
            {/* Inline tempo + meter controls (migrated from GlobalPropertiesPanel) */}
            <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-neutral-300" title={tempoAutomationEnabled ? 'Tempo is automated — edit keyframes in the tempo lane' : 'Global tempo (BPM)'}>
                    <span>BPM</span>
                    <input
                        aria-label="Global tempo (BPM)"
                        className={`number-input w-[70px] ${tempoAutomationEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        type="number"
                        min={1}
                        max={400}
                        step={0.1}
                        value={localTempo}
                        onChange={(e) => !tempoAutomationEnabled && setLocalTempo(e.target.value)}
                        onBlur={() => !tempoAutomationEnabled && commitTempo()}
                        onKeyDown={(e) => { if (!tempoAutomationEnabled && e.key === 'Enter') { commitTempo(); (e.currentTarget as any).blur?.(); } }}
                        disabled={tempoAutomationEnabled}
                    />
                </label>
                <label className="flex items-center gap-1 text-neutral-300" title="Beats per bar (meter numerator)">
                    <span>BPB</span>
                    <input
                        aria-label="Beats per bar"
                        className="number-input w-[60px]"
                        type="number"
                        min={1}
                        max={16}
                        step={1}
                        value={localBeatsPerBar}
                        onChange={(e) => setLocalBeatsPerBar(e.target.value)}
                        onBlur={commitBeatsPerBar}
                        onKeyDown={(e) => { if (e.key === 'Enter') { commitBeatsPerBar(); (e.currentTarget as any).blur?.(); } }}
                    />
                </label>
            </div>
            {/* Snap group: three-segment pill — [magnet | snap denominator | adaptive] */}
            <div className="flex items-stretch rounded-md border border-neutral-700 overflow-hidden text-[11px]">
                {/* Segment 1: Snap enable toggle */}
                <button
                    aria-label={
                        magnetActive
                            ? `Disable snapping (${currentQuantizeLabel})`
                            : `Enable snapping (${pendingQuantizeLabel})`
                    }
                    title={
                        magnetActive
                            ? `Snapping: ${currentQuantizeLabel} — click or press S to turn off`
                            : `Snapping off — click or press S to turn on (${pendingQuantizeLabel})`
                    }
                    onClick={() => setQuantize(magnetActive ? 'off' : lastNonOffQuantizeRef.current)}
                    className={`px-2 py-1 flex items-center justify-center transition-colors ${magnetActive
                        ? 'bg-blue-600/70 text-white'
                        : 'bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                        }`}
                >
                    <FaMagnet />
                </button>
                {/* Divider */}
                <div className="w-px bg-neutral-700 self-stretch" />
                {/* Segment 2: Snap denominator select */}
                <select
                    aria-label="Snap quantize"
                    disabled={adaptiveSnap}
                    className={`bg-neutral-900/60 px-1 py-[3px] cursor-pointer focus:outline-none transition-colors border-0 ${adaptiveSnap
                        ? 'text-neutral-600 cursor-not-allowed opacity-50'
                        : magnetActive
                            ? 'text-white'
                            : 'text-neutral-400'
                        }`}
                    value={snapSelectValue}
                    onChange={(e) => setQuantize(e.target.value as SnapQuantizeOption)}
                >
                    {TIMELINE_SNAP_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.shortLabel}
                        </option>
                    ))}
                </select>
                {/* Divider */}
                <div className="w-px bg-neutral-700 self-stretch" />
                {/* Segment 3: Adaptive snap toggle */}
                <button
                    aria-label={adaptiveSnap ? 'Adaptive snapping: on — click to use fixed snap' : 'Adaptive snapping: off — click to enable zoom-aware snap'}
                    title={adaptiveSnap ? 'Adaptive snapping on — snap denominator adjusts with zoom' : 'Adaptive snapping off — click to enable zoom-aware snapping'}
                    onClick={() => setAdaptiveSnap(!adaptiveSnap)}
                    className={`px-2 py-1 flex items-center justify-center transition-colors ${adaptiveSnap
                        ? 'bg-blue-600/70 text-white'
                        : 'bg-neutral-900/60 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                        }`}
                >
                    <FaMagic />
                </button>
            </div>
            {/* Auto-follow playhead button */}
            <button
                aria-label={follow ? 'Auto follow playhead: on' : 'Auto follow playhead: off'}
                title={follow ? 'Auto follow playhead: on (click to disable)' : 'Auto follow playhead: off (click to enable)'}
                onClick={() => setFollow && setFollow(!follow)}
                className={`px-2 py-1 rounded border border-neutral-700 flex items-center justify-center transition-colors ${follow
                    ? 'bg-blue-600/70 text-white border-blue-400/70'
                    : 'bg-neutral-900/60 text-neutral-200 hover:bg-neutral-800/60'
                    }`}
            >
                <FaArrowRight />
            </button>
            {/* Ellipsis menu trigger */}
            <button
                {...getMenuReferenceProps({
                    type: 'button',
                    onClick: () => setMenuOpen((open) => !open),
                    'aria-haspopup': 'menu',
                    'aria-expanded': menuOpen,
                    title: 'Timeline options',
                })}
                ref={menuRefs.setReference}
                className="px-2 py-1 rounded border border-border bg-menubar hover:bg-neutral-800/60 text-neutral-200 flex items-center justify-center text-[12px]"
            >
                <FaEllipsisV />
            </button>
            {menuOpen && (
                <FloatingPortal>
                    <FloatingFocusManager context={menuContext} modal={false} initialFocus={-1}>
                        <div
                            {...getMenuFloatingProps({
                                role: 'menu',
                                'aria-label': 'Timeline options menu',
                                className:
                                    'w-64 rounded border border-border bg-panel/95 p-3 shadow-lg shadow-black/40 flex flex-col gap-3 text-neutral-200 backdrop-blur-sm z-[1000] text-xs',
                            })}
                            ref={menuRefs.setFloating}
                            style={menuFloatingStyles}
                        >
                            {/* Zoom slider */}
                            <label className="text-neutral-300 flex items-center gap-2" title="Adjust timeline zoom">
                                <span>Zoom</span>
                                <input aria-label="Timeline zoom" className="flex-1" type="range" min={0} max={100} step={1} value={zoomVal} onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setZoomVal(v);
                                    const newRange = rangeFromSlider(v);
                                    const center = (view.startTick + view.endTick) / 2;
                                    const newStart = Math.round(center - newRange / 2);
                                    const newEnd = Math.round(newStart + newRange);
                                    setTimelineViewTicks(newStart, newEnd);
                                }} />
                            </label>
                            {/* View preset buttons */}
                            <div className="flex items-center gap-1" role="none">
                                <button
                                    className="flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1"
                                    title="Fit all content (Shift+1)"
                                    onClick={() => { onFitAll?.(); setMenuOpen(false); }}
                                >
                                    <FaExpand className="text-neutral-300" />
                                </button>
                                <button
                                    className="flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1"
                                    title="Zoom to selection (Shift+2)"
                                    onClick={() => { onZoomToSelection?.(); setMenuOpen(false); }}
                                >
                                    <FaObjectGroup className="text-neutral-300" />
                                </button>
                                <button
                                    className="flex-1 px-2 py-1 rounded border border-neutral-700 bg-neutral-900/50 text-neutral-200 hover:bg-neutral-800/60 flex items-center justify-center gap-1"
                                    title="Center on playhead (F)"
                                    onClick={() => { onCenterOnPlayhead?.(); setMenuOpen(false); }}
                                >
                                    <FaCrosshairs className="text-neutral-300" />
                                </button>
                            </div>
                        </div>
                    </FloatingFocusManager>
                </FloatingPortal>
            )}
        </div>
    );
};

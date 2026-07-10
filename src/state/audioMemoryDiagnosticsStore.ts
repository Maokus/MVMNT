import { createWithEqualityFn } from 'zustand/traditional';
import { debugLog } from '@utils/debug-log';

export type AudioMemoryDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface AudioMemoryDiagnosticEvent {
    id: string;
    timestamp: number;
    severity: AudioMemoryDiagnosticSeverity;
    stage: string;
    message: string;
    sourceId?: string;
    fileName?: string;
    fileCount?: number;
    bytes?: Record<string, number | undefined>;
    durationMs?: number;
}

interface AudioMemoryDiagnosticsState {
    events: AudioMemoryDiagnosticEvent[];
    record: (event: Omit<AudioMemoryDiagnosticEvent, 'id' | 'timestamp'> & { timestamp?: number }) => void;
    clear: () => void;
}

const EVENT_LIMIT = 120;

function createEventId(): string {
    return `audio-memory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function logToConsole(event: AudioMemoryDiagnosticEvent): void {
    const payload = {
        sourceId: event.sourceId,
        fileName: event.fileName,
        fileCount: event.fileCount,
        bytes: event.bytes,
        durationMs: event.durationMs,
    };
    if (event.severity === 'error') {
        console.error(`[audio-memory] ${event.stage}: ${event.message}`, payload);
        return;
    }
    if (event.severity === 'warning') {
        console.warn(`[audio-memory] ${event.stage}: ${event.message}`, payload);
        return;
    }
    debugLog(`[audio-memory] ${event.stage}: ${event.message}`, payload);
}

export const useAudioMemoryDiagnosticsStore = createWithEqualityFn<AudioMemoryDiagnosticsState>((set) => ({
    events: [],
    record(event) {
        const entry: AudioMemoryDiagnosticEvent = {
            ...event,
            id: createEventId(),
            timestamp: event.timestamp ?? Date.now(),
        };
        logToConsole(entry);
        set((state) => {
            const events = [...state.events, entry];
            while (events.length > EVENT_LIMIT) {
                events.shift();
            }
            return { events };
        });
    },
    clear() {
        set({ events: [] });
    },
}));

export function recordAudioMemoryDiagnostic(
    event: Omit<AudioMemoryDiagnosticEvent, 'id' | 'timestamp'> & { timestamp?: number }
): void {
    useAudioMemoryDiagnosticsStore.getState().record(event);
}

import {
    SceneElement,
    asNumber,
    asTrimmedString,
    Text,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    type PropertyTransform,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema, SceneElementInterface } from '@mvmnt/plugin-sdk';

const normalizeMidiTrackId: PropertyTransform<string | null, SceneElementInterface> = (value, element) =>
    asTrimmedString(value, element) ?? null;

export class TrackerlikeMidiDisplayElement extends SceneElement {
    constructor(id: string = 'trackerlike-midi-display', config: Record<string, unknown> = {}) {
        super('trackerlike-midi-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        const base = super.getConfigSchema();
        const basicGroups = base.groups.filter((group) => group.variant !== 'advanced');
        const advancedGroups = base.groups.filter((group) => group.variant === 'advanced');

        return {
            ...base,
            name: 'Trackerlike Midi Display',
            description: 'A tracker-style MIDI display showing notes per beat in monospace text',
            category: 'extraspack1',
            groups: [
                ...basicGroups,
                {
                    id: 'midiSource',
                    label: 'MIDI Source',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'midiTrackId',
                            type: 'timelineTrackRef',
                            label: 'MIDI Track',
                            default: null,
                            allowedTrackTypes: ['midi'],
                            description: 'The MIDI track to display notes from',
                            runtime: { transform: normalizeMidiTrackId, defaultValue: null },
                        },
                    ],
                },
                {
                    id: 'trackerAppearance',
                    label: 'Tracker',
                    variant: 'basic',
                    collapsed: false,
                    properties: [
                        {
                            key: 'rowCount',
                            type: 'number',
                            label: 'Rows (beats per page)',
                            default: 8,
                            min: 1,
                            max: 32,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 8 },
                        },
                        {
                            key: 'fontSize',
                            type: 'number',
                            label: 'Font Size',
                            default: 16,
                            min: 8,
                            max: 64,
                            step: 1,
                            runtime: { transform: asNumber, defaultValue: 16 },
                        },
                        {
                            key: 'textColor',
                            type: 'colorAlpha',
                            label: 'Text Color',
                            default: '#e2e8f0FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#e2e8f0FF' },
                        },
                        {
                            key: 'activeColor',
                            type: 'colorAlpha',
                            label: 'Active Row Color',
                            default: '#10B981FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#10B981FF' },
                        },
                        {
                            key: 'headerColor',
                            type: 'colorAlpha',
                            label: 'Header Color',
                            default: '#94a3b8FF',
                            runtime: { transform: asTrimmedString, defaultValue: '#94a3b8FF' },
                        },
                    ],
                },
                ...advancedGroups,
            ],
        };
    }

    protected override _buildRenderObjects(_config: unknown, targetTime: number): RenderObject[] {
        const props = this.getSchemaProps();

        if (!props.visible) return [];

        const objects: RenderObject[] = [];

        if (!props.midiTrackId) {
            objects.push(new Text(0, 0, 'Select a MIDI track', '14px monospace', '#94a3b8', 'left', 'top'));
            return objects;
        }

        const { api, status, missingCapabilities } = getPluginHostApi([
            PLUGIN_CAPABILITIES.timelineRead,
            PLUGIN_CAPABILITIES.timingConversion,
        ]);

        if (!api || status !== 'ok') {
            const message =
                status === 'unsupported-version'
                    ? 'Plugin API version unsupported'
                    : missingCapabilities.includes(PLUGIN_CAPABILITIES.timelineRead)
                      ? 'Timeline API unavailable'
                      : 'Plugin host API unavailable';
            objects.push(new Text(0, 0, message, '12px monospace', '#64748b', 'left', 'top'));
            return objects;
        }

        const rowCount = props.rowCount;
        const fontSize = props.fontSize;
        const lineHeight = Math.round(fontSize * 1.6);
        const font = `${fontSize}px monospace`;

        // Convert current time to beats (0-indexed)
        const currentBeats = api.timing.secondsToBeats(targetTime) ?? 0;
        const currentBeatFloor = Math.floor(Math.max(0, currentBeats));

        // Page: which group of rowCount beats are we in
        const pageStart = Math.floor(currentBeatFloor / rowCount) * rowCount;
        const activeRowIndex = currentBeatFloor - pageStart; // 0-indexed row within this page

        // Header: track name
        const track = api.timeline.getTrackById(props.midiTrackId);
        const trackLabel = track?.name ?? '?';
        objects.push(new Text(0, 0, ` T> ${trackLabel}`, font, props.headerColor, 'left', 'top'));

        // Beat rows
        for (let i = 0; i < rowCount; i++) {
            const beat = pageStart + i; // 0-indexed absolute beat
            const isActive = i === activeRowIndex;

            // Time window for this beat
            const beatStartSec = api.timing.beatsToSeconds(beat) ?? beat;
            const beatEndSec = api.timing.beatsToSeconds(beat + 1) ?? (beat + 1);

            // Get notes that START within this beat's window
            const candidates = api.timeline.selectNotesInWindow({
                trackIds: [props.midiTrackId],
                startSec: beatStartSec,
                endSec: beatEndSec,
            });
            const firstNote = candidates.find(
                (n) => n.startTime >= beatStartSec && n.startTime < beatEndSec,
            );

            const noteName = firstNote ? api.utilities.midiNoteToName(firstNote.note).padEnd(3) : '-- ';
            const cursor = isActive ? '>' : ' ';
            const beatNum = String(i + 1).padStart(2);
            const line = `${cursor}${beatNum} ${noteName}`;

            const color = isActive ? props.activeColor : props.textColor;
            const y = lineHeight * (i + 1);
            objects.push(new Text(0, y, line, font, color, 'left', 'top'));
        }

        return objects;
    }
}

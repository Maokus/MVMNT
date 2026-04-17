import {
    SceneElement,
    Text,
    getPluginHostApi,
    PLUGIN_CAPABILITIES,
    prop,
    insertElementGroups,
    type RenderObject,
} from '@mvmnt/plugin-sdk';
import type { EnhancedConfigSchema } from '@mvmnt/plugin-sdk';

export class TrackerlikeMidiDisplayElement extends SceneElement {
    constructor(id: string = 'trackerlike-midi-display', config: Record<string, unknown> = {}) {
        super('trackerlike-midi-display', id, config);
    }

    static override getConfigSchema(): EnhancedConfigSchema {
        return insertElementGroups(super.getConfigSchema(), {
            name: 'Trackerlike Midi Display',
            description: 'A tracker-style MIDI display showing notes per beat in monospace text',
        }, [
            {
                id: 'midiSource',
                label: 'MIDI Source',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.midiTrack('midiTrackId', 'MIDI Track', { description: 'The MIDI track to display notes from' }),
                ],
            },
            {
                id: 'trackerLayout',
                label: 'Layout',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.number('division', 'Division (rows per beat)', 1, { min: 1, max: 32, step: 1, description: '1 = quarter notes, 2 = 8th, 4 = 16th, etc.' }),
                    prop.number('rowCount', 'Rows per page', 8, { step: 1 }),
                    prop.number('columns', 'Note columns', 1, { min: 1, max: 8, step: 1, description: 'How many simultaneous notes to show per row' }),
                    prop.boolean('showTrackName', 'Show Track Name', true),
                ],
            },
            {
                id: 'trackerAppearance',
                label: 'Appearance',
                variant: 'basic',
                collapsed: false,
                properties: [
                    prop.number('fontSize', 'Font Size', 16, { step: 1 }),
                    prop.colorAlpha('textColor', 'Text Color', '#e2e8f0FF'),
                    prop.colorAlpha('activeColor', 'Active Row Color', '#10B981FF'),
                    prop.colorAlpha('headerColor', 'Header Color', '#94a3b8FF'),
                ],
            },
        ]);
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

        const division = Math.max(1, Math.round(props.division));
        const rowCount = props.rowCount;
        const columns = Math.max(1, Math.round(props.columns));
        const fontSize = props.fontSize;
        const lineHeight = Math.round(fontSize * 1.6);
        const font = `${fontSize}px monospace`;

        // Current position in subbeats (beats * division)
        const currentBeats = api.timing.secondsToBeats(targetTime) ?? 0;
        const currentSubbeat = Math.floor(Math.max(0, currentBeats) * division);

        // Page: which group of rowCount subbeats are we in
        const pageStart = Math.floor(currentSubbeat / rowCount) * rowCount;
        const activeRowIndex = currentSubbeat - pageStart; // 0-indexed row within this page

        let yOffset = 0;

        // Header row
        if (props.showTrackName) {
            const track = api.timeline.getTrackById(props.midiTrackId);
            const trackLabel = track?.name ?? '?';
            objects.push(new Text(0, 0, ` T> ${trackLabel}`, font, props.headerColor, 'left', 'top'));
            yOffset = lineHeight;
        }

        // Subbeat rows
        for (let i = 0; i < rowCount; i++) {
            const subbeat = pageStart + i; // 0-indexed absolute subbeat
            const isActive = i === activeRowIndex;

            // Time window for this subbeat (1/division of a beat wide)
            const subbeatStartSec = api.timing.beatsToSeconds(subbeat / division) ?? subbeat / division;
            const subbeatEndSec = api.timing.beatsToSeconds((subbeat + 1) / division) ?? (subbeat + 1) / division;

            // Get notes that START within this subbeat's window, up to `columns` of them
            const candidates = api.timeline.selectNotesInWindow({
                trackIds: [props.midiTrackId],
                startSec: subbeatStartSec,
                endSec: subbeatEndSec,
            });
            const starting = candidates
                .filter((n) => n.startTime >= subbeatStartSec && n.startTime < subbeatEndSec)
                .slice(0, columns);

            // Build note columns: each is 4 chars wide ("C3  ", "C#3 ", "-- ")
            const noteCells = Array.from({ length: columns }, (_, col) => {
                const note = starting[col];
                return note ? api.utilities.midiNoteToName(note.note).padEnd(4) : '--  ';
            });

            const cursor = isActive ? '>' : ' ';
            const rowNum = String(i + 1).padStart(2);
            const line = `${cursor}${rowNum} ${noteCells.join(' ')}`;

            const color = isActive ? props.activeColor : props.textColor;
            const y = yOffset + lineHeight * i;
            objects.push(new Text(0, y, line, font, color, 'left', 'top'));
        }

        return objects;
    }
}

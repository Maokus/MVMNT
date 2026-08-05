type ImportTrackType = 'audio' | 'midi';
type NamedTrack = { name: string; type: string };

/** Builds the next stable, user-facing name for a track created through file import. */
export function getNextImportedTrackName(type: ImportTrackType, tracks: Record<string, NamedTrack>): string {
    const prefix = type === 'audio' ? 'Audio Track' : 'MIDI Track';
    const matchingName = new RegExp(`^${prefix} (\\d+)$`);
    let highestNumber = 0;

    for (const track of Object.values(tracks)) {
        if (track.type !== type) continue;
        const match = matchingName.exec(track.name);
        if (match) highestNumber = Math.max(highestNumber, Number(match[1]));
    }

    return `${prefix} ${highestNumber + 1}`;
}

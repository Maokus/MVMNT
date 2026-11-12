export const MIDI_FILE_REGEX = /\.mid(i)?$/i;
export const AUDIO_FILE_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'aiff', 'aif', 'caf', 'opus', 'wma'];
export const AUDIO_FILE_REGEX = new RegExp(`[.](${AUDIO_FILE_EXTENSIONS.join('|')})$`, 'i');
export const MEDIA_FILE_ACCEPT = ['.mid', '.midi', 'audio/*', ...AUDIO_FILE_EXTENSIONS.map((ext) => `.${ext}`)].join(
    ','
);

export function isMidiFile(file: File): boolean {
    const name = file.name?.toLowerCase?.() ?? '';
    const type = file.type?.toLowerCase?.() ?? '';
    return MIDI_FILE_REGEX.test(name) || type === 'audio/midi' || type === 'audio/x-midi';
}

export function isAudioFile(file: File): boolean {
    if (!file) return false;
    const type = file.type?.toLowerCase?.() ?? '';
    if (type.startsWith('audio/')) return true;
    const name = file.name?.toLowerCase?.() ?? '';
    return AUDIO_FILE_REGEX.test(name);
}

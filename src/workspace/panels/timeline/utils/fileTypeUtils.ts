export const MIDI_FILE_REGEX = /\.mid(i)?$/i;
export const AUDIO_FILE_REGEX = /\.(wav|mp3|ogg|flac|m4a|aac|aiff|aif|caf|opus|wma)$/i;

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

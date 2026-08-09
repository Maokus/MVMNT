let warned = false;

export function registerMp3Encoder() {
    if (!warned) {
        // eslint-disable-next-line no-console
        console.warn(
            '[mp3-encoder-loader] Optional MP3 encoder package is not installed. Exporting MP3 will be disabled.'
        );
        warned = true;
    }
}

export function reportMissingEncoder(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[mp3-encoder-loader] Failed to load optional MP3 encoder module', error);
}

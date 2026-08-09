let warned = false;

export function registerAacEncoder() {
    if (!warned) {
        // eslint-disable-next-line no-console
        console.warn(
            '[aac-encoder-loader] Optional AAC encoder package is not installed. Exporting AAC will be disabled.'
        );
        warned = true;
    }
}

export function reportMissingEncoder(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[aac-encoder-loader] Failed to load optional AAC encoder module', error);
}

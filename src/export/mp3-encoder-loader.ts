// Lazy MP3 encoder registration helper
// -------------------------------------
// This dynamically loads the optional '@mediabunny/mp3-encoder' package only when an
// export actually needs MP3 encoding. This avoids pulling the WASM + related code
// into the initial bundle or blocking the export modal render when users are not
// exporting to MP3.
//
// The function is idempotent and safe to call multiple times; subsequent calls
// resolve immediately after the first successful registration.

const MP3_ENCODER_MODULE_ID = '@mediabunny/mp3-encoder';

let mp3RegistrationPromise: Promise<void> | null = null;
let mp3Registered = false;

async function loadMp3EncoderModule() {
    try {
        const moduleId = MP3_ENCODER_MODULE_ID;
        const importer: (specifier: string) => Promise<any> = (specifier) =>
            import(/* @vite-ignore */ specifier);
        return await importer(moduleId);
    } catch (error) {
        const fallback = await import('./mp3-encoder-optional-fallback');
        fallback.reportMissingEncoder(error);
        return fallback;
    }
}

export function ensureMp3EncoderRegistered(): Promise<void> {
    if (mp3Registered) return Promise.resolve();
    if (mp3RegistrationPromise) return mp3RegistrationPromise;
    mp3RegistrationPromise = (async () => {
        try {
            const mod = await loadMp3EncoderModule();
            if (mod?.registerMp3Encoder) {
                mod.registerMp3Encoder();
                mp3Registered = true;
                // eslint-disable-next-line no-console
                console.log('[mp3-encoder-loader] MP3 encoder registered lazily');
            } else {
                // eslint-disable-next-line no-console
                console.warn('[mp3-encoder-loader] Module loaded but registerMp3Encoder missing');
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[mp3-encoder-loader] Failed to load MP3 encoder module', e);
        }
    })();
    return mp3RegistrationPromise;
}

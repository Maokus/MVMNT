// Lazy AAC encoder registration helper
// -------------------------------------
// This dynamically loads the optional '@mediabunny/aac-encoder' package only when an
// export actually needs AAC encoding. This avoids pulling the WASM + related code
// into the initial bundle or blocking the export modal render when users are not
// exporting to AAC.
//
// The function is idempotent and safe to call multiple times; subsequent calls
// resolve immediately after the first successful registration.

let aacRegistrationPromise: Promise<void> | null = null;
let aacRegistered = false;

async function loadAacEncoderModule(): Promise<{ mod: any; isFallback: boolean }> {
    try {
        const mod = await import('@mediabunny/aac-encoder');
        return { mod, isFallback: false };
    } catch (error) {
        const fallback = await import('./aac-encoder-optional-fallback');
        fallback.reportMissingEncoder(error);
        return { mod: fallback, isFallback: true };
    }
}

export function ensureAacEncoderRegistered(): Promise<void> {
    if (aacRegistered) return Promise.resolve();
    if (aacRegistrationPromise) return aacRegistrationPromise;
    aacRegistrationPromise = (async () => {
        try {
            const { mod, isFallback } = await loadAacEncoderModule();
            if (mod?.registerAacEncoder) {
                mod.registerAacEncoder();
                if (isFallback) {
                    aacRegistered = false;
                    // Fallback already logged; allow future retries when module becomes available.
                } else {
                    aacRegistered = true;
                    // eslint-disable-next-line no-console
                    console.log('[aac-encoder-loader] AAC encoder registered lazily');
                }
            } else {
                // eslint-disable-next-line no-console
                console.warn('[aac-encoder-loader] Module loaded but registerAacEncoder missing');
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[aac-encoder-loader] Failed to load AAC encoder module', e);
        } finally {
            aacRegistrationPromise = null;
        }
    })();
    return aacRegistrationPromise;
}

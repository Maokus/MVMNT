/**
 * Utilities: MIDI note names, color helpers, font loading, and bundled asset access.
 *
 * @module @mvmnt/plugin-sdk/utils
 */

// MIDI utilities
export { utilitiesApi } from '@core/scene/plugins/plugin-sdk-capabilities';
export { noteName, groupNotesByPitch } from '@core/scene/plugins/plugin-sdk-shortcuts';

// Color helpers
export {
    normalizeColorAlphaValue,
    ensureEightDigitHex,
} from '@utils/color';

// Font loading
export {
    loadGoogleFont,
    loadGoogleFontAsync,
    ensureFontLoaded,
    isFontLoaded,
    parseFontSelection,
    type LoadFontOptions,
} from '@fonts/font-loader';
export type { ParsedFontSelection } from '@state/scene/fonts';

/**
 * Load a bundled asset from the plugin's assets/ directory by its relative path.
 *
 * Returns a blob URL that can be used as an `<img src>`, CSS `url()`, or passed
 * to `new window.Image()`. The URL is valid for the lifetime of the plugin.
 *
 * This stub is replaced at runtime by the plugin loader with a version bound to
 * this plugin's asset registry. In dev mode (Vite), import assets directly:
 * `import logoUrl from './assets/logo.png?url'`
 */
export function loadBundledAsset(_path: string): Promise<string> {
    return Promise.reject(
        new Error(
            '[MVMNT] loadBundledAsset() is only available in production-bundled plugins. ' +
            'In dev mode, import assets directly: import url from "./assets/logo.png?url"'
        )
    );
}

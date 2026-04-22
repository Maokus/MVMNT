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

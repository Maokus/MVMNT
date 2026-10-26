/**
 * User-facing workspace messages. Single source of truth for release copy
 * shown in alerts, inline errors, and logs — do not reword without UX review.
 */
export const PROJECT_NAME_REQUIRED = 'Please provide a project name before saving.';

export const MACRO_NAME_REQUIRED = 'Please enter a macro name';

export const MACRO_RENAME_FAILED = 'Failed to rename macro. Name might already exist.';

export const MACRO_CREATE_FAILED = 'Failed to create macro. Name might already exist.';

export const PLUGIN_INVALID_FILE_TYPE = 'Invalid file type. Please select a .mvmnt-plugin file.';

export const EXPORT_DESTINATION_UNAVAILABLE = 'Could not choose an export destination.';

export const SCREEN_COLOR_SAMPLE_FAILED = 'Could not sample a screen color.';

export const AUDIO_IMPORT_FAILED_LOG = 'Failed to import audio track';

export const AUDIO_IMPORT_BAD_FORMAT = 'The format may be unsupported or the file may be corrupted.';

export function failedToLoadSceneDetail(reason: string): string {
    return `Failed to load scene: ${reason}`;
}

export function unableToImportAudioFileMessage(fileName: string, reason: string): string {
    return `Unable to import ${fileName}. ${reason}`;
}

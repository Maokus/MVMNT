import { ensureSceneFontsLoaded } from '@fonts/font-loader';
import { validateSceneEnvelope } from '../validate';
import { migrateSceneV8 } from '../migrations/sceneV8';
import { migrateSceneRotationUnitsV7 } from '../migrations/rotationUnitsV7';
import { prepareTextBoundsMigrationFonts } from '../migrations/textBoundsV11';
import { throwIfImportAborted } from '../import-abort';

export async function migrateAndValidateScene(
    envelope: any,
    fontPayloads: Map<string, Uint8Array>,
    signal?: AbortSignal
) {
    await prepareTextBoundsMigrationFonts(envelope, fontPayloads);
    throwIfImportAborted(signal);
    const envelopeAfterMigrations = migrateSceneV8(migrateSceneRotationUnitsV7(envelope));
    const validation = validateSceneEnvelope(envelopeAfterMigrations);
    if (validation.ok) {
        await ensureSceneFontsLoaded(envelopeAfterMigrations.scene?.elements, envelopeAfterMigrations.scene?.macros);
        throwIfImportAborted(signal);
    }
    return { envelope: envelopeAfterMigrations, validation };
}

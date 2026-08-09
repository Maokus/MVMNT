import { validateSceneEnvelope } from '../validate';
import { migrateSceneV8 } from '../migrations/sceneV8';
import { migrateSceneFontsV9 } from '../migrations/fontsV9';
import { migrateSceneRotationUnitsV7 } from '../migrations/rotationUnitsV7';
import { prepareTextBoundsMigrationFonts } from '../migrations/textBoundsV11';
import { throwIfImportAborted } from '../import-abort';
import { resolveLegacyGoogleFonts } from './fontMigration';

export async function migrateAndValidateScene(
    envelope: any,
    fontPayloads: Map<string, Uint8Array>,
    signal?: AbortSignal
) {
    await prepareTextBoundsMigrationFonts(envelope, fontPayloads);
    throwIfImportAborted(signal);
    const staticallyMigrated = migrateSceneFontsV9(migrateSceneV8(migrateSceneRotationUnitsV7(envelope)));
    const fontUpgrade = await resolveLegacyGoogleFonts(staticallyMigrated, fontPayloads, signal);
    const envelopeAfterMigrations = fontUpgrade.envelope;
    const validation = validateSceneEnvelope(envelopeAfterMigrations);
    if (validation.ok) throwIfImportAborted(signal);
    return {
        envelope: envelopeAfterMigrations,
        validation,
        fontUpgradeWarnings: fontUpgrade.warnings,
        fontUpgradePerformed: fontUpgrade.upgraded,
    };
}

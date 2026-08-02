import { migrateSceneMidiClipsV8 } from './midiClipsV8';
import { migrateSceneAudioClipSourceTimeV10 } from './audioClipSourceTimeV10';
import { migrateSceneTextBoundsV11 } from './textBoundsV11';
import { migrateSceneGraphV12 } from './sceneGraphV12';
import { migrateAutomationTargetsV13 } from './automationTargetsV13';

export const SCENE_SCHEMA_VERSION = 8;

/** Upgrade any released scene to the single document shape introduced with MVMNT 0.16. */
export function migrateSceneV8<T extends Record<string, any>>(envelope: T): T {
    if (envelope.schemaVersion === SCENE_SCHEMA_VERSION && envelope.scene?.graph) return envelope;
    const migrated = migrateAutomationTargetsV13(
        migrateSceneGraphV12(
            migrateSceneTextBoundsV11(migrateSceneAudioClipSourceTimeV10(migrateSceneMidiClipsV8(envelope)))
        )
    );
    return {
        ...migrated,
        schemaVersion: SCENE_SCHEMA_VERSION,
        assets:
            migrated.assets && typeof migrated.assets === 'object'
                ? { ...migrated.assets, storage: 'zip-package' }
                : migrated.assets,
    } as T;
}

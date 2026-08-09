import { migrateSceneMidiClipsV8 } from './midiClipsV8';
import { migrateSceneAudioClipSourceTimeV10 } from './audioClipSourceTimeV10';
import { migrateSceneTextBoundsV11 } from './textBoundsV11';
import { migrateSceneGraphV12 } from './sceneGraphV12';
import { migrateAutomationTargetsV13 } from './automationTargetsV13';

export const SCENE_SCHEMA_VERSION = 8;

function normalizeNodeAppearance<T extends Record<string, any>>(envelope: T): T {
    const graph = envelope.scene?.graph;
    if (!graph?.nodesById || typeof graph.nodesById !== 'object') return envelope;
    const needsMigration = Object.values(graph.nodesById).some((node: any) => {
        const transform = node?.userNodeTransform;
        return (
            !transform ||
            typeof transform.scaleX !== 'number' ||
            typeof transform.scaleY !== 'number' ||
            typeof node.localOpacity !== 'number'
        );
    });
    if (!needsMigration) return envelope;
    const nodesById = Object.fromEntries(
        Object.entries(graph.nodesById).map(([id, rawNode]: [string, any]) => {
            const node = rawNode && typeof rawNode === 'object' ? rawNode : {};
            const transform =
                node.userNodeTransform && typeof node.userNodeTransform === 'object' ? node.userNodeTransform : {};
            const uniformScale = typeof transform.uniformScale === 'number' ? transform.uniformScale : 1;
            const { uniformScale: _retired, ...rest } = transform;
            return [
                id,
                {
                    ...node,
                    localOpacity: typeof node.localOpacity === 'number' ? node.localOpacity : 1,
                    userNodeTransform: {
                        ...rest,
                        scaleX: typeof transform.scaleX === 'number' ? transform.scaleX : uniformScale,
                        scaleY: typeof transform.scaleY === 'number' ? transform.scaleY : uniformScale,
                    },
                },
            ];
        })
    );
    return {
        ...envelope,
        scene: { ...envelope.scene, graph: { ...graph, nodesById } },
    } as T;
}

/** Upgrade any released scene to the single document shape introduced with MVMNT 0.16. */
export function migrateSceneV8<T extends Record<string, any>>(envelope: T): T {
    if (Number(envelope.schemaVersion) >= SCENE_SCHEMA_VERSION && envelope.scene?.graph) {
        return normalizeNodeAppearance(envelope);
    }
    const migrated = migrateAutomationTargetsV13(
        migrateSceneGraphV12(
            migrateSceneTextBoundsV11(migrateSceneAudioClipSourceTimeV10(migrateSceneMidiClipsV8(envelope)))
        )
    );
    return normalizeNodeAppearance({
        ...migrated,
        schemaVersion: SCENE_SCHEMA_VERSION,
        assets:
            migrated.assets && typeof migrated.assets === 'object'
                ? { ...migrated.assets, storage: 'zip-package' }
                : migrated.assets,
    } as T);
}

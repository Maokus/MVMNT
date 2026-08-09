import type { AutomationKeyframe, AutomationValueType, PropertyTarget } from '@automation/types';
import type { NodeTransform, SceneGraphState, DuplicateMappings, Matrix2D } from '@state/scene-graph';
import type { BindingState, SceneImportPayload, SceneMacroDefinition, SceneSerializedMacros } from '@state/sceneStore';
import type { SceneSubtreeBundle, SceneSubtreeImportOptions } from './subtreeBundle';
import type { FontAsset } from './fonts';

export type SceneCommand =
    | { type: 'batch'; commands: SceneCommand[] }
    | {
          type: 'addElement';
          elementType: string;
          elementId: string;
          config?: Record<string, unknown>;
          targetIndex?: number;
          createdAt?: number;
          createdBy?: string;
      }
    | { type: 'removeElement'; elementId: string }
    | { type: 'updateElementConfig'; elementId: string; patch: Record<string, unknown> }
    | { type: 'moveElement'; elementId: string; targetIndex: number }
    | { type: 'duplicateElement'; sourceId: string; newId: string; insertAfter?: boolean }
    | { type: 'updateElementId'; currentId: string; nextId: string }
    | { type: 'clearScene'; clearMacros?: boolean }
    | { type: 'resetSceneSettings' }
    | { type: 'updateSceneSettings'; patch: Record<string, unknown> }
    | { type: 'loadSerializedScene'; payload: SceneImportPayload }
    | { type: 'registerFontAsset'; asset: FontAsset }
    | { type: 'deleteFontAsset'; assetId: string }
    | ({ type: 'importSubtreeBundle'; bundle: SceneSubtreeBundle } & SceneSubtreeImportOptions)
    | { type: 'createMacro'; macroId: string; definition: SceneMacroDefinition }
    | { type: 'updateMacroValue'; macroId: string; value: unknown }
    | { type: 'renameMacro'; currentId: string; nextId: string }
    | { type: 'deleteMacro'; macroId: string }
    | { type: 'reorderMacros'; order: string[] }
    | { type: 'importMacros'; payload: SceneSerializedMacros }
    | {
          type: 'enablePropertyAutomation';
          target: PropertyTarget;
          valueType: AutomationValueType;
          initialKeyframes?: AutomationKeyframe[];
      }
    | { type: 'disablePropertyAutomation'; target: PropertyTarget; fallbackValue?: unknown }
    | { type: 'updatePropertyTargetBinding'; target: PropertyTarget; binding: BindingState | null }
    | { type: 'addKeyframe'; channelId: string; keyframe: AutomationKeyframe }
    | { type: 'removeKeyframe'; channelId: string; tick: number }
    | {
          type: 'updateKeyframe';
          channelId: string;
          tick: number;
          patch: Partial<
              Pick<
                  AutomationKeyframe,
                  'value' | 'segmentInterpolation' | 'leftHandle' | 'rightHandle' | 'leftHandleType' | 'rightHandleType'
              >
          >;
      }
    | { type: 'moveKeyframe'; channelId: string; fromTick: number; toTick: number }
    | { type: 'batchUpdateKeyframes'; channelId: string; keyframes: AutomationKeyframe[] }
    | { type: 'replaceGraph'; graph: SceneGraphState; expectedRevision?: number }
    | { type: 'updateNodeTransform'; nodeId: string; transform: Partial<NodeTransform> }
    | { type: 'setNodeVisibility'; nodeId: string; visible: boolean }
    | { type: 'setNodeOpacity'; nodeId: string; opacity: number }
    | { type: 'setNodeLocked'; nodeId: string; locked: boolean }
    | { type: 'setNodeName'; nodeId: string; name: string }
    | { type: 'groupNodes'; nodeIds: string[]; groupId: string; name?: string; worldPivot?: { x: number; y: number } }
    | { type: 'ungroupNode'; nodeId: string }
    | { type: 'deleteSubtrees'; nodeIds: string[] }
    | { type: 'duplicateSubtrees'; nodeIds: string[]; mappings: DuplicateMappings }
    | { type: 'reorderNodes'; parentId: string; nodeIds: string[]; targetIndex: number }
    | { type: 'reparentNodes'; nodeIds: string[]; newParentId: string; targetIndex: number }
    | { type: 'transformNodes'; nodeIds: string[]; worldDelta: Matrix2D };

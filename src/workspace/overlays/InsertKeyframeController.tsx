import React, { useEffect, useRef, useState } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { isTextEditingTarget, useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { isCommandSurfaceActive } from '@context/commands/commandContext';
import { hoveredPropertyRef } from '@workspace/panels/properties/hoveredPropertyRef';
import { resolveAutomationValueType } from '@workspace/panels/properties/KeyframeControl';
import { elementPropertyTarget, nodePropertyTarget } from '@automation/types';
import { insertPropertyKeyframe } from '@state/scene';
import { useTimelineStore } from '@state/timelineStore';
import InsertKeyframePopup from '@workspace/panels/properties/InsertKeyframePopup';

// Controller for the "i" key → insert keyframe popup. Must live inside SceneSelectionProvider.
export const InsertKeyframeController: React.FC = () => {
    const { selectedElement, selectedElementSchema, activeNodeId } = useSceneSelection();
    const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
    const mousePos = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            mousePos.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, []);

    useGlobalShortcut({
        id: 'scene.insert-keyframe',
        domain: 'focused-control',
        matches: (event) => {
            if (event.key.toLowerCase() !== 'i' || event.altKey || event.ctrlKey || event.metaKey || !activeNodeId)
                return false;
            return !isTextEditingTarget(event.target) && isCommandSurfaceActive(['preview', 'properties'], event);
        },
        handle: (event) => {
            event.preventDefault();
            const apply = () => {
                const hovered = hoveredPropertyRef.current;
                const valueType = hovered && resolveAutomationValueType(hovered.propertyType);
                if (hovered && valueType) {
                    const target =
                        hovered.owner.kind === 'node'
                            ? nodePropertyTarget(hovered.owner.id, hovered.propertyKey)
                            : elementPropertyTarget(hovered.owner.id, hovered.propertyKey);
                    insertPropertyKeyframe(
                        target,
                        valueType,
                        useTimelineStore.getState().timeline.currentTick,
                        'keyframe-hotkey'
                    );
                } else {
                    setPopupPos({ x: mousePos.current.x, y: mousePos.current.y });
                }
            };
            apply();
            return true;
        },
    });

    if (!popupPos || !activeNodeId) return null;

    return (
        <InsertKeyframePopup
            position={popupPos}
            nodeId={activeNodeId}
            elementId={selectedElement?.id}
            schema={selectedElementSchema ?? undefined}
            onClose={() => setPopupPos(null)}
        />
    );
};

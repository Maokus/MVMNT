import React, { useEffect } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import { unresolvedTrackInputs, validTrackSelection } from '@context/trackInputSetup';
import { useSceneStore } from '@state/sceneStore';
import { useTimelineStore } from '@state/timelineStore';
import TrackInputAssignPopup from '@workspace/components/TrackInputAssignPopup';
import { CacheDiagnosticsPopup } from '@workspace/components/CacheDiagnosticsPopup';

// Track setup takes priority over audio analysis while both remain mounted.
export const TrackInputPopupController: React.FC = () => {
    const { trackInputPopup, dismissTrackInputPopup, updateElementConfig, selectedElementId } = useSceneSelection();
    const elementId = trackInputPopup?.elementId;
    const element = useSceneStore((state) => (elementId ? state.elements[elementId] : undefined));
    const bindings = useSceneStore((state) => (elementId ? state.bindings.byElement[elementId] : undefined));
    const tracks = useTimelineStore((state) => state.tracks);
    const inputs = unresolvedTrackInputs(trackInputPopup?.trackInputs ?? [], bindings ?? {}, tracks);
    const active = Boolean(trackInputPopup && element && selectedElementId === elementId && inputs.length);

    useEffect(() => {
        if (trackInputPopup && !active) dismissTrackInputPopup();
    }, [active, trackInputPopup, dismissTrackInputPopup]);

    const handleAssign = (assignments: Record<string, string | string[] | null>) => {
        if (!trackInputPopup || !active) return;
        // Read current bindings so inspector edits cannot be overwritten by a stale draft.
        const currentInputs = unresolvedTrackInputs(
            trackInputPopup.trackInputs,
            useSceneStore.getState().bindings.byElement[trackInputPopup.elementId] ?? {},
            useTimelineStore.getState().tracks
        );
        const patch: Record<string, unknown> = {};
        for (const input of currentInputs) {
            const value = assignments[input.key];
            if (validTrackSelection(input, value, useTimelineStore.getState().tracks)) patch[input.key] = value;
        }
        if (Object.keys(patch).length > 0) {
            updateElementConfig(trackInputPopup.elementId, patch);
            dismissTrackInputPopup();
        }
    };

    return (
        <>
            {active && trackInputPopup && (
                <TrackInputAssignPopup
                    key={trackInputPopup.elementId}
                    elementId={trackInputPopup.elementId}
                    trackInputs={inputs}
                    onDismiss={dismissTrackInputPopup}
                    onAssign={handleAssign}
                />
            )}
            <CacheDiagnosticsPopup presentationBlocked={active} />
        </>
    );
};

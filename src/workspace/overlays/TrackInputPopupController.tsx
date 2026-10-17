import React, { useEffect } from 'react';
import { useSceneSelection } from '@context/SceneSelectionContext';
import TrackInputAssignPopup from '@workspace/components/TrackInputAssignPopup';

// Controller for the track input assignment popup shown after adding an element with track inputs.
export const TrackInputPopupController: React.FC = () => {
    const { trackInputPopup, dismissTrackInputPopup, updateElementConfig, selectedElementId } = useSceneSelection();

    // Dismiss when user selects a different element (or deselects)
    useEffect(() => {
        if (!trackInputPopup) return;
        if (selectedElementId !== trackInputPopup.elementId) {
            dismissTrackInputPopup();
        }
    }, [selectedElementId, trackInputPopup, dismissTrackInputPopup]);

    if (!trackInputPopup) return null;

    const handleAssign = (assignments: Record<string, string | string[] | null>) => {
        const patch: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(assignments)) {
            if (value !== null && !(Array.isArray(value) && value.length === 0)) {
                patch[key] = value;
            }
        }
        if (Object.keys(patch).length > 0) {
            updateElementConfig(trackInputPopup.elementId, patch);
        }
        dismissTrackInputPopup();
    };

    return (
        <TrackInputAssignPopup
            elementId={trackInputPopup.elementId}
            trackInputs={trackInputPopup.trackInputs}
            onDismiss={dismissTrackInputPopup}
            onAssign={handleAssign}
        />
    );
};

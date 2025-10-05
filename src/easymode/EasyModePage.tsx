import React from 'react';
import { VisualizerProvider } from '@context/VisualizerContext';
import { MacroProvider } from '@context/MacroContext';
import { UndoProvider } from '@context/UndoContext';
import { SceneProvider } from '@context/SceneContext';
import { SceneSelectionProvider } from '@context/SceneSelectionContext';
import EasyModeLayout from './EasyModeLayout';
import EasyModeTemplateInitializer from './EasyModeTemplateInitializer';

const EasyModePage: React.FC = () => {
    return (
        <VisualizerProvider>
            <MacroProvider>
                <UndoProvider>
                    <SceneProvider>
                        <EasyModeTemplateInitializer />
                        <SceneSelectionProvider>
                            <EasyModeLayout />
                        </SceneSelectionProvider>
                    </SceneProvider>
                </UndoProvider>
            </MacroProvider>
        </VisualizerProvider>
    );
};

export default EasyModePage;

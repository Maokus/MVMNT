import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SceneSelectionState {
    selectedElementId: string | null;
    selectedElement: any;
    selectedElementSchema: any;
    refreshTrigger: number;
    visualizer: any;
}

interface SceneSelectionActions {
    selectElement: (elementId: string | null) => void;
    clearSelection: () => void;
    updateElementConfig: (elementId: string, changes: { [key: string]: any }) => void;
    addElement: (elementType: string) => void;
    incrementRefreshTrigger: () => void;
}

interface SceneSelectionContextType extends SceneSelectionState, SceneSelectionActions { }

const SceneSelectionContext = createContext<SceneSelectionContextType | undefined>(undefined);

interface SceneSelectionProviderProps {
    children: React.ReactNode;
    visualizer: any;
    sceneRefreshTrigger?: number;
}

export const SceneSelectionProvider: React.FC<SceneSelectionProviderProps> = ({
    children,
    visualizer,
    sceneRefreshTrigger
}) => {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const updatePropertiesHeader = useCallback((element: any) => {
        const propertiesHeader = document.getElementById('propertiesHeader');
        if (propertiesHeader) {
            if (element) {
                const truncatedId = element.id.length > 15 ? element.id.substring(0, 12) + '...' : element.id;
                propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
                propertiesHeader.title = `Properties | ${element.id}`;
            } else {
                propertiesHeader.textContent = '⚙️ Properties';
                propertiesHeader.title = '';
            }
        }
    }, []);

    const selectElement = useCallback((elementId: string | null) => {
        setSelectedElementId(elementId);

        if (elementId && visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                const element = sceneBuilder.getElement(elementId);
                const schema = sceneBuilder.sceneElementRegistry.getSchema(element?.type);

                setSelectedElement(element);
                setSelectedElementSchema(schema);
                updatePropertiesHeader(element);
            }
        } else {
            setSelectedElement(null);
            setSelectedElementSchema(null);
            updatePropertiesHeader(null);
        }
    }, [visualizer, updatePropertiesHeader]);

    const clearSelection = useCallback(() => {
        selectElement(null);
    }, [selectElement]);

    const updateElementConfig = useCallback((elementId: string, changes: { [key: string]: any }) => {
        if (!elementId || !visualizer) return;

        const sceneBuilder = visualizer.getSceneBuilder();
        if (sceneBuilder) {
            if (typeof sceneBuilder.updateElementConfig === 'function') {
                const success = sceneBuilder.updateElementConfig(elementId, changes);

                if (success) {
                    // Trigger re-render using invalidateRender to ensure the render happens
                    if (visualizer.invalidateRender) {
                        visualizer.invalidateRender();
                    }
                } else {
                    console.warn(`Failed to update config for element '${elementId}'`);
                }
            } else {
                console.warn(`[updateElementConfig] SceneBuilder does not support updateElementConfig method for element '${elementId}'`);
            }
        }
    }, [visualizer]);

    const addElement = useCallback((elementType: string) => {
        if (!visualizer) return;

        const sceneBuilder = visualizer.getSceneBuilder();
        if (sceneBuilder) {
            const uniqueId = `${elementType}_${Date.now()}`;
            const success = sceneBuilder.addElement(elementType, uniqueId);

            if (success) {
                // Trigger re-render using invalidateRender to ensure the render happens
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }

                // Trigger refresh of SceneEditor elements list
                setRefreshTrigger(prev => prev + 1);

                // Select the newly added element
                selectElement(uniqueId);
            }
        }
    }, [visualizer, selectElement]);

    const incrementRefreshTrigger = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    // Scene Builder integration
    useEffect(() => {
        if (visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                console.log('Scene builder integrated with React context');
            }
        }
    }, [visualizer]);

    const contextValue: SceneSelectionContextType = {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        refreshTrigger: refreshTrigger + (sceneRefreshTrigger || 0),
        visualizer,
        selectElement,
        clearSelection,
        updateElementConfig,
        addElement,
        incrementRefreshTrigger,
    };

    return (
        <SceneSelectionContext.Provider value={contextValue}>
            {children}
        </SceneSelectionContext.Provider>
    );
};

export const useSceneSelection = () => {
    const context = useContext(SceneSelectionContext);
    if (context === undefined) {
        throw new Error('useSceneSelection must be used within a SceneSelectionProvider');
    }
    return context;
};

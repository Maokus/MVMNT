import { useState, useEffect } from 'react';

interface UseSidePanelsProps {
    visualizer: any;
    sceneRefreshTrigger?: number;
}

interface SidePanelsState {
    selectedElementId: string | null;
    selectedElement: any;
    selectedElementSchema: any;
    refreshTrigger: number;
}

interface SidePanelsActions {
    handleElementSelect: (elementId: string | null) => void;
    handleElementConfigChange: (elementId: string, changes: { [key: string]: any }) => void;
    handleAddElement: (elementType: string) => void;
    setRefreshTrigger: React.Dispatch<React.SetStateAction<number>>;
    setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
    setSelectedElement: React.Dispatch<React.SetStateAction<any>>;
    setSelectedElementSchema: React.Dispatch<React.SetStateAction<any>>;
}

export const useSidePanels = ({ 
    visualizer, 
    sceneRefreshTrigger 
}: UseSidePanelsProps): SidePanelsState & SidePanelsActions => {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [selectedElementSchema, setSelectedElementSchema] = useState<any>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Handle element selection from SceneEditor
    const handleElementSelect = (elementId: string | null) => {
        setSelectedElementId(elementId);

        if (elementId && visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                const element = sceneBuilder.getElement(elementId);
                const schema = sceneBuilder.sceneElementRegistry.getSchema(element?.type);

                setSelectedElement(element);
                setSelectedElementSchema(schema);

                // Update properties header
                const propertiesHeader = document.getElementById('propertiesHeader');
                if (propertiesHeader && element) {
                    const truncatedId = element.id.length > 15 ? element.id.substring(0, 12) + '...' : element.id;
                    propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
                    propertiesHeader.title = `Properties | ${element.id}`;
                }
            }
        } else {
            setSelectedElement(null);
            setSelectedElementSchema(null);

            // Reset properties header
            const propertiesHeader = document.getElementById('propertiesHeader');
            if (propertiesHeader) {
                propertiesHeader.textContent = '⚙️ Properties';
                propertiesHeader.title = '';
            }
        }
    };

    // Handle element config changes
    const handleElementConfigChange = (elementId: string, changes: { [key: string]: any }) => {
        if (!elementId || !visualizer) return;

        const sceneBuilder = visualizer.getSceneBuilder();
        if (sceneBuilder) {
            const element = sceneBuilder.getElement(elementId);
            if (element) {
                // Apply changes to element config
                Object.assign(element.config, changes);
                element._applyConfig();

                // Trigger re-render using invalidateRender to ensure the render happens
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }
            }
        }
    };

    // Handle adding new element from header
    const handleAddElement = (elementType: string) => {
        if (!visualizer) return;

        const sceneBuilder = visualizer.getSceneBuilder();
        if (sceneBuilder) {
            const uniqueId = `${elementType}_${Date.now()}`;
            const success = sceneBuilder.addElement(elementType, uniqueId);

            if (success) {
                setSelectedElementId(uniqueId);

                // Get the newly added element
                const element = sceneBuilder.getElement(uniqueId);
                const schema = sceneBuilder.sceneElementRegistry.getSchema(element?.type);

                setSelectedElement(element);
                setSelectedElementSchema(schema);

                // Update properties header
                const propertiesHeader = document.getElementById('propertiesHeader');
                if (propertiesHeader && element) {
                    const truncatedId = element.id.length > 15 ? element.id.substring(0, 12) + '...' : element.id;
                    propertiesHeader.textContent = `⚙️ Properties | ${truncatedId}`;
                    propertiesHeader.title = `Properties | ${element.id}`;
                }

                // Trigger re-render using invalidateRender to ensure the render happens
                if (visualizer.invalidateRender) {
                    visualizer.invalidateRender();
                }

                // Trigger refresh of SceneEditor elements list
                setRefreshTrigger(prev => prev + 1);
            }
        }
    };

    // Scene Builder integration
    useEffect(() => {
        if (visualizer) {
            const sceneBuilder = visualizer.getSceneBuilder();
            if (sceneBuilder) {
                // Scene builder is available - no additional setup needed
                console.log('Scene builder integrated with React components');
            }
        }
    }, [visualizer]);

    return {
        selectedElementId,
        selectedElement,
        selectedElementSchema,
        refreshTrigger,
        handleElementSelect,
        handleElementConfigChange,
        handleAddElement,
        setRefreshTrigger,
        setSelectedElementId,
        setSelectedElement,
        setSelectedElementSchema
    };
};

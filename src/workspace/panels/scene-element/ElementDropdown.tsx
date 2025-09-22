import React from 'react';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

interface ElementDropdownProps {
    onAddElement: (elementType: string) => void;
    onClose: () => void;
}

const ElementDropdown: React.FC<ElementDropdownProps> = ({ onAddElement, onClose }) => {
    const types = sceneElementRegistry.getElementTypeInfo();

    // Group by category
    const categories: { [key: string]: any[] } = {};
    for (const type of types as any[]) {
        if (!categories[type.category]) {
            categories[type.category] = [];
        }
        categories[type.category].push(type);
    }

    const handleItemClick = (elementType: string) => {
        onAddElement(elementType);
        onClose();
    };

    return (
        <div
            className="absolute top-full right-0 z-[1000] bg-menubar border border-control2 rounded mt-1 max-h-[300px] overflow-y-auto shadow-lg min-w-[200px]"
        >
            {Object.entries(categories).map(([category, categoryTypes]) => (
                <div key={category}>
                    <div
                        className="px-3 py-2 text-[11px] font-bold text-neutral-300 bg-control border-b border-control2 uppercase"
                    >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                    </div>
                    {categoryTypes.map((type: any) => (
                        <div
                            key={type.type}
                            className="px-3 py-2 cursor-pointer border-b border-control2 text-[13px] text-neutral-300 hover:bg-control/80 transition-colors"
                            onClick={() => handleItemClick(type.type)}
                            title={type.description}
                        >
                            {type.name}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

export default ElementDropdown;

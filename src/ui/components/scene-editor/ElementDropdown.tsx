import React from 'react';
import { sceneElementRegistry } from '../../../visualizer/scene-element-registry.js';

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
            className="element-dropdown show"
            style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                background: '#2d2d30',
                border: '1px solid #464647',
                borderRadius: '4px',
                marginTop: '4px',
                maxHeight: '300px',
                overflowY: 'auto',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            }}
        >
            {Object.entries(categories).map(([category, categoryTypes]) => (
                <div key={category}>
                    <div
                        className="element-dropdown-category"
                        style={{
                            padding: '8px 12px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: '#cccccc',
                            background: '#3c3c3c',
                            borderBottom: '1px solid #464647',
                            textTransform: 'uppercase',
                        }}
                    >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                    </div>
                    {categoryTypes.map((type: any) => (
                        <div
                            key={type.type}
                            className="element-dropdown-item"
                            onClick={() => handleItemClick(type.type)}
                            title={type.description}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #464647',
                                fontSize: '13px',
                                color: '#cccccc',
                                transition: 'background-color 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#464647';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
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

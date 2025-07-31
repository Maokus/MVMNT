import React from 'react';
import ElementListItem from './ElementListItem';

interface ElementListProps {
    elements: any[];
    selectedElementId: string | null;
    onElementSelect: (elementId: string) => void;
    onToggleVisibility: (elementId: string) => void;
    onMoveElement: (elementId: string, newIndex: number) => void;
    onDuplicateElement: (elementId: string) => void;
    onDeleteElement: (elementId: string) => void;
    onUpdateElementId: (oldId: string, newId: string) => boolean;
}

const ElementList: React.FC<ElementListProps> = ({
    elements,
    selectedElementId,
    onElementSelect,
    onToggleVisibility,
    onMoveElement,
    onDuplicateElement,
    onDeleteElement,
    onUpdateElementId,
}) => {
    return (
        <div>
            {elements.map((element, index) => (
                <ElementListItem
                    key={element.id}
                    element={element}
                    index={index}
                    totalElements={elements.length}
                    isSelected={selectedElementId === element.id}
                    onSelect={() => onElementSelect(element.id)}
                    onToggleVisibility={() => onToggleVisibility(element.id)}
                    onMoveUp={() => onMoveElement(element.id, index - 1)}
                    onMoveDown={() => onMoveElement(element.id, index + 1)}
                    onDuplicate={() => onDuplicateElement(element.id)}
                    onDelete={() => onDeleteElement(element.id)}
                    onUpdateId={onUpdateElementId}
                />
            ))}
        </div>
    );
};

export default ElementList;

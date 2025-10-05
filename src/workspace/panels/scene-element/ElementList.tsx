import React, { useCallback, useMemo, useState } from 'react';
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
    const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
    const [draggingHeight, setDraggingHeight] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);

    const resetDragState = useCallback(() => {
        setDraggingElementId(null);
        setDraggingHeight(null);
        setDropIndex(null);
    }, []);

    const handleDragStart = useCallback((elementId: string, height: number) => {
        setDraggingElementId(elementId);
        setDraggingHeight(height);
        setDropIndex(null);
    }, []);

    const handleDragOver = useCallback(
        (event: React.DragEvent<HTMLDivElement>, index: number) => {
            if (!draggingElementId) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const bounding = event.currentTarget.getBoundingClientRect();
            const offset = event.clientY - bounding.top;
            const shouldInsertBefore = offset < bounding.height / 2;
            const nextIndex = shouldInsertBefore ? index : index + 1;

            setDropIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
        },
        [draggingElementId],
    );

    const handleDragOverContainer = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!draggingElementId) {
                return;
            }

            event.preventDefault();

            if (elements.length === 0) {
                setDropIndex(0);
                return;
            }

            const container = event.currentTarget;
            const bounding = container.getBoundingClientRect();
            const offsetY = event.clientY - bounding.top;

            if (offsetY < 0) {
                setDropIndex(0);
            } else if (offsetY > bounding.height) {
                setDropIndex(elements.length);
            }
        },
        [draggingElementId, elements.length],
    );

    const handleDrop = useCallback(() => {
        if (!draggingElementId || dropIndex === null) {
            resetDragState();
            return;
        }

        const currentIndex = elements.findIndex((el) => el.id === draggingElementId);
        if (currentIndex === -1) {
            resetDragState();
            return;
        }

        let targetIndex = dropIndex;
        if (dropIndex > currentIndex) {
            targetIndex -= 1;
        }

        if (targetIndex !== currentIndex) {
            onMoveElement(draggingElementId, targetIndex);
        }

        resetDragState();
    }, [draggingElementId, dropIndex, elements, onMoveElement, resetDragState]);

    const placeholderStyle = useMemo(() => {
        if (draggingHeight === null) {
            return undefined;
        }

        return {
            height: `${draggingHeight}px`,
            minHeight: `${draggingHeight}px`,
        } as React.CSSProperties;
    }, [draggingHeight]);

    const renderInsertionLine = useCallback(
        (index: number) => {
            if (dropIndex !== index) {
                return null;
            }

            return <div className="h-0.5 bg-[#1177bb] rounded my-1" />;
        },
        [dropIndex],
    );

    const handleDragLeave = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!draggingElementId) {
                return;
            }

            const related = event.relatedTarget as Node | null;
            if (!related) {
                return;
            }

            if (!event.currentTarget.contains(related)) {
                setDropIndex(null);
            }
        },
        [draggingElementId],
    );

    return (
        <div
            onDragOver={handleDragOverContainer}
            onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDrop();
            }}
            onDragEnd={resetDragState}
            onDragLeave={handleDragLeave}
        >
            {elements.map((element, index) => {
                const isDragging = element.id === draggingElementId;

                return (
                    <React.Fragment key={element.id}>
                        {renderInsertionLine(index)}
                        <div className="relative">
                            <ElementListItem
                                element={element}
                                index={index}
                                totalElements={elements.length}
                                isSelected={selectedElementId === element.id}
                                isDragging={isDragging}
                                onSelect={() => onElementSelect(element.id)}
                                onToggleVisibility={() => onToggleVisibility(element.id)}
                                onMoveUp={() => onMoveElement(element.id, index - 1)}
                                onMoveDown={() => onMoveElement(element.id, index + 1)}
                                onDuplicate={() => onDuplicateElement(element.id)}
                                onDelete={() => onDeleteElement(element.id)}
                                onUpdateId={onUpdateElementId}
                                onDragStart={(height) => handleDragStart(element.id, height)}
                                onDragOver={(event) => handleDragOver(event, index)}
                                onDragEnd={resetDragState}
                            />
                            {isDragging ? (
                                <div className="pointer-events-none absolute inset-0 flex">
                                    <div
                                        className="flex-1 rounded border border-dashed border-[#1177bb]"
                                        style={placeholderStyle}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </React.Fragment>
                );
            })}
            {renderInsertionLine(elements.length)}
        </div>
    );
};

export default ElementList;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const draggingElementIdRef = useRef<string | null>(null);
    const dropIndexRef = useRef<number | null>(null);
    const pointerDragRef = useRef<{ pointerId: number; startY: number } | null>(null);

    useEffect(() => {
        if (selectedElementId) {
            itemRefs.current.get(selectedElementId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [selectedElementId]);

    const resetDragState = useCallback(() => {
        draggingElementIdRef.current = null;
        dropIndexRef.current = null;
        pointerDragRef.current = null;
        setDraggingElementId(null);
        setDraggingHeight(null);
        setDropIndex(null);
    }, []);

    const setDropTarget = useCallback((index: number | null) => {
        dropIndexRef.current = index;
        setDropIndex((currentIndex) => (currentIndex === index ? currentIndex : index));
    }, []);

    const startDrag = useCallback((elementId: string, height: number) => {
        draggingElementIdRef.current = elementId;
        setDraggingElementId(elementId);
        setDraggingHeight(height);
        setDropTarget(null);
    }, [setDropTarget]);

    const commitDrag = useCallback(() => {
        const draggedId = draggingElementIdRef.current;
        const targetIndex = dropIndexRef.current;
        if (!draggedId || targetIndex === null) {
            resetDragState();
            return;
        }

        const currentIndex = elements.findIndex((el) => el.id === draggedId);
        if (currentIndex === -1) {
            resetDragState();
            return;
        }

        let reorderedIndex = targetIndex;
        if (targetIndex > currentIndex) {
            reorderedIndex -= 1;
        }

        if (reorderedIndex !== currentIndex) {
            onMoveElement(draggedId, reorderedIndex);
        }

        resetDragState();
    }, [elements, onMoveElement, resetDragState]);

    const updateDropTargetForPointer = useCallback((clientY: number) => {
        for (let index = 0; index < elements.length; index += 1) {
            const element = elements[index];
            const rect = itemRefs.current.get(element.id)?.getBoundingClientRect();
            if (rect && clientY < rect.top + rect.height / 2) {
                setDropTarget(index);
                return;
            }
        }
        setDropTarget(elements.length);
    }, [elements, setDropTarget]);

    const handlePointerDragStart = useCallback((elementId: string, height: number, event: React.PointerEvent<HTMLDivElement>) => {
        pointerDragRef.current = { pointerId: event.pointerId, startY: event.clientY };
        draggingElementIdRef.current = elementId;
        setDraggingHeight(height);
        setDropTarget(null);
    }, [setDropTarget]);

    const handlePointerDragMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const pointerDrag = pointerDragRef.current;
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;

        if (!draggingElementId) {
            if (Math.abs(event.clientY - pointerDrag.startY) < 4) return;
            const draggedId = draggingElementIdRef.current;
            if (!draggedId) return;
            startDrag(draggedId, draggingHeight ?? 1);
        }

        updateDropTargetForPointer(event.clientY);
    }, [draggingElementId, draggingHeight, startDrag, updateDropTargetForPointer]);

    const handlePointerDragEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const pointerDrag = pointerDragRef.current;
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        if (draggingElementIdRef.current && dropIndexRef.current !== null) commitDrag();
        else resetDragState();
    }, [commitDrag, resetDragState]);

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

    return (
        <div>
            {elements.map((element, index) => {
                const isDragging = element.id === draggingElementId;

                return (
                    <React.Fragment key={element.id}>
                        {renderInsertionLine(index)}
                        <div
                            className="relative"
                            ref={(node) => {
                                if (node) itemRefs.current.set(element.id, node);
                                else itemRefs.current.delete(element.id);
                            }}
                        >
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
                                onPointerDragStart={(height, event) => handlePointerDragStart(element.id, height, event)}
                                onPointerDragMove={handlePointerDragMove}
                                onPointerDragEnd={handlePointerDragEnd}
                                onPointerDragCancel={resetDragState}
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

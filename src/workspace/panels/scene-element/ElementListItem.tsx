import React, { useState, useRef, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaArrowUp, FaArrowDown, FaClone, FaTrash, FaPen } from 'react-icons/fa';
import { sceneElementRegistry } from '@core/scene/registry';

interface ElementListItemProps {
    element: any;
    index: number;
    totalElements: number;
    isSelected: boolean;
    isDragging?: boolean;
    onSelect: () => void;
    onToggleVisibility: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onUpdateId: (oldId: string, newId: string) => boolean;
    onPointerDragStart: (height: number, event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerDragMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerDragEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerDragCancel: () => void;
}

const ElementListItem: React.FC<ElementListItemProps> = ({
    element,
    index,
    totalElements,
    isSelected,
    onSelect,
    isDragging = false,
    onToggleVisibility,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onDelete,
    onUpdateId,
    onPointerDragStart,
    onPointerDragMove,
    onPointerDragEnd,
    onPointerDragCancel,
}) => {
    const [isEditingId, setIsEditingId] = useState(false);
    const [editValue, setEditValue] = useState(element.id);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Get element type info
    const typeInfo = sceneElementRegistry.getElementTypeInfo().find((t: any) => t.type === element.type);
    const elementTypeName = typeInfo ? (typeInfo as any).name : element.type;

    // Handle starting advanced mode
    const startEditing = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(element.id);
        setIsEditingId(true);
    };

    // Handle finishing edit
    const finishEditing = (save: boolean = true) => {
        setIsEditingId(false);

        if (save && editValue.trim() && editValue.trim() !== element.id) {
            const success = onUpdateId(element.id, editValue.trim());
            if (!success) {
                setEditValue(element.id); // Reset on failure
            }
        } else {
            setEditValue(element.id); // Reset to original
        }
    };

    // Handle input events
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEditing(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishEditing(false);
        }
    };

    // Focus input when editing starts
    useEffect(() => {
        if (isEditingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditingId]);

    // Handle control button clicks
    const handleControlClick = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation();
        action();
    };

    const isInteractiveTarget = (target: EventTarget) =>
        target instanceof Element &&
        Boolean(target.closest('button, input, textarea, select, a, [contenteditable="true"]'));

    const baseItem = 'element-list-item';
    const unselected = 'element-list-item--unselected';
    const selected = 'element-list-item--selected';
    const draggingState = isDragging ? 'opacity-0' : '';
    return (
        <div
            ref={containerRef}
            className={`${baseItem} ${isSelected ? selected : unselected} ${draggingState}`}
            onClick={onSelect}
            draggable={false}
            onDragStart={(event) => {
                event.preventDefault();
            }}
            onPointerDown={(event) => {
                if (isEditingId || event.button > 0 || isInteractiveTarget(event.target)) return;
                const rect = containerRef.current?.getBoundingClientRect();
                const height = rect?.height ?? containerRef.current?.offsetHeight ?? 1;
                event.currentTarget.setPointerCapture(event.pointerId);
                onPointerDragStart(height, event);
            }}
            onPointerMove={onPointerDragMove}
            onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }
                onPointerDragEnd(event);
            }}
            onPointerCancel={() => {
                onPointerDragCancel();
            }}
        >
            <div className="element-list-item__identity">
                <div className="element-list-item__name-row">
                    {isEditingId ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => finishEditing(true)}
                            onKeyDown={handleKeyDown}
                            className="element-list-item__rename-input"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <>
                            <span className="element-list-item__name" title={element.id} onDoubleClick={startEditing}>
                                {element.id}
                            </span>
                            <button
                                className="element-list-item__rename-button"
                                onClick={startEditing}
                                title="Edit element ID"
                                aria-label="Edit element ID"
                            >
                                <FaPen />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="element-list-item__actions">
                <span className="element-list-item__type" title={elementTypeName}>
                    {elementTypeName}
                </span>
                <button
                    className={`element-list-item__icon-button ${element.visible ? 'is-active' : ''}`}
                    onClick={(e) => handleControlClick(e, onToggleVisibility)}
                    title={`${element.visible ? 'Hide' : 'Show'} element`}
                    aria-label={`${element.visible ? 'Hide' : 'Show'} element`}
                >
                    {element.visible ? <FaEye /> : <FaEyeSlash />}
                </button>

                <div className="element-list-item__reorder-actions">
                    <button
                        className="element-list-item__icon-button"
                        onClick={(e) => handleControlClick(e, onMoveUp)}
                        title="Move up"
                        aria-label="Move up"
                        disabled={index === 0}
                    >
                        <FaArrowUp />
                    </button>
                    <button
                        className="element-list-item__icon-button"
                        onClick={(e) => handleControlClick(e, onMoveDown)}
                        title="Move down"
                        aria-label="Move down"
                        disabled={index === totalElements - 1}
                    >
                        <FaArrowDown />
                    </button>
                </div>
                <button
                    className="element-list-item__icon-button"
                    onClick={(e) => handleControlClick(e, onDuplicate)}
                    title="Duplicate element"
                    aria-label="Duplicate element"
                >
                    <FaClone />
                </button>
                <button
                    className="element-list-item__icon-button element-list-item__delete-button"
                    onClick={(e) => handleControlClick(e, onDelete)}
                    title="Delete element"
                    aria-label="Delete element"
                >
                    <FaTrash />
                </button>
            </div>
        </div>
    );
};

export default ElementListItem;

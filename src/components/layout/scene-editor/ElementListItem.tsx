import React, { useState, useRef, useEffect } from 'react';
import { sceneElementRegistry } from '../../../visualizer/scene-element-registry.js';

interface ElementListItemProps {
    element: any;
    index: number;
    totalElements: number;
    isSelected: boolean;
    onSelect: () => void;
    onToggleVisibility: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onUpdateId: (oldId: string, newId: string) => boolean;
}

const ElementListItem: React.FC<ElementListItemProps> = ({
    element,
    index,
    totalElements,
    isSelected,
    onSelect,
    onToggleVisibility,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onDelete,
    onUpdateId,
}) => {
    const [isEditingId, setIsEditingId] = useState(false);
    const [editValue, setEditValue] = useState(element.id);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get element type info
    const typeInfo = sceneElementRegistry.getElementTypeInfo().find((t: any) => t.type === element.type);
    const elementTypeName = typeInfo ? (typeInfo as any).name : element.type;

    // Truncate text utility
    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    };

    const truncatedId = truncateText(element.id, 18);

    // Handle starting edit mode
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

    return (
        <div
            className={`element-item ${isSelected ? 'selected' : ''}`}
            onClick={onSelect}
        >
            <div className="element-info">
                <div className="element-name-container">
                    {isEditingId ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => finishEditing(true)}
                            onKeyDown={handleKeyDown}
                            className="element-id-input"
                            style={{
                                width: '100%',
                                fontSize: '13px',
                                padding: '2px 4px',
                                border: '1px solid #0e639c',
                                borderRadius: '2px',
                                background: '#3c3c3c',
                                color: '#ffffff',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <>
                            <span
                                className="element-name"
                                title={element.id}
                                onDoubleClick={startEditing}
                            >
                                {truncatedId}
                            </span>
                            <button
                                className="edit-id-btn"
                                onClick={startEditing}
                                title="Edit element ID"
                            >
                                ✏️
                            </button>
                        </>
                    )}
                </div>
                <div className="element-type">{elementTypeName}</div>
            </div>

            <div className="element-controls">
                <button
                    className={`visibility-toggle ${element.visible ? 'visible' : ''}`}
                    onClick={(e) => handleControlClick(e, onToggleVisibility)}
                    title={`${element.visible ? 'Hide' : 'Show'} element`}
                >
                    {element.visible ? '👁️' : '👁️‍🗨️'}
                </button>

                <div className="z-index-controls">
                    <button
                        onClick={(e) => handleControlClick(e, onMoveUp)}
                        title="Move up"
                        disabled={index === 0}
                    >
                        ↑
                    </button>
                    <button
                        onClick={(e) => handleControlClick(e, onMoveDown)}
                        title="Move down"
                        disabled={index === totalElements - 1}
                    >
                        ↓
                    </button>
                </div>

                <button
                    onClick={(e) => handleControlClick(e, onDuplicate)}
                    title="Duplicate element"
                >
                    📋
                </button>

                <button
                    onClick={(e) => handleControlClick(e, onDelete)}
                    title="Delete element"
                >
                    🗑️
                </button>
            </div>
        </div>
    );
};

export default ElementListItem;

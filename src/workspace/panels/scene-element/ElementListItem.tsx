import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FaEye, FaEyeSlash, FaArrowUp, FaArrowDown, FaClone, FaTrash, FaPen } from 'react-icons/fa';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

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
    const idContainerRef = useRef<HTMLDivElement>(null);
    const [maxIdLength, setMaxIdLength] = useState(18);

    // Get element type info
    const typeInfo = sceneElementRegistry.getElementTypeInfo().find((t: any) => t.type === element.type);
    const elementTypeName = typeInfo ? (typeInfo as any).name : element.type;

    // Truncate text utility
    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    };

    const truncatedId = useMemo(() => truncateText(element.id, maxIdLength), [element.id, maxIdLength]);

    useEffect(() => {
        const idContainer = idContainerRef.current;
        if (!idContainer || typeof ResizeObserver === 'undefined') {
            return;
        }

        const averageCharacterWidth = 7;
        const paddingAllowance = 16;

        const updateMaxIdLength = () => {
            const { width } = idContainer.getBoundingClientRect();
            if (!width) {
                return;
            }

            const computedLength = Math.max(
                8,
                Math.min(64, Math.floor((width - paddingAllowance) / averageCharacterWidth))
            );

            setMaxIdLength((current) => (current === computedLength ? current : computedLength));
        };

        updateMaxIdLength();

        const observer = new ResizeObserver(() => {
            updateMaxIdLength();
        });

        observer.observe(idContainer);

        return () => {
            observer.disconnect();
        };
    }, []);

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

    const baseItem =
        'flex items-center justify-between px-3 py-0.5 mb-1 border rounded cursor-pointer transition select-none touch-none';
    const unselected =
        'bg-[color:var(--twc-control)] border-[color:var(--twc-control2)] hover:bg-[color:var(--twc-control2)] hover:border-neutral-500';
    const selected = 'bg-[#0e639c] border-[#1177bb] text-white';
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
            <div className="flex-1" ref={idContainerRef}>
                <div className="flex items-center gap-1 mb-0.5">
                    {isEditingId ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => finishEditing(true)}
                            onKeyDown={handleKeyDown}
                            className="outline-none"
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
                                className="font-medium text-[13px] cursor-pointer"
                                title={element.id}
                                onDoubleClick={startEditing}
                            >
                                {truncatedId}
                            </span>
                            <button
                                className="bg-transparent border-0 text-[10px] px-0 py-0 opacity-60 cursor-pointer transition hover:opacity-100 flex items-center"
                                onClick={startEditing}
                                title="Edit element ID"
                                aria-label="Edit element ID"
                            >
                                <FaPen />
                            </button>
                        </>
                    )}
                </div>
                <div className="text-[11px] opacity-70">{elementTypeName}</div>
            </div>

            <div className="flex gap-1">
                <button
                    className={`opacity-50 cursor-pointer bg-transparent border-0 text-xs transition hover:opacity-100 ${element.visible ? 'opacity-100' : ''} flex items-center`}
                    onClick={(e) => handleControlClick(e, onToggleVisibility)}
                    title={`${element.visible ? 'Hide' : 'Show'} element`}
                    aria-label={`${element.visible ? 'Hide' : 'Show'} element`}
                >
                    {element.visible ? <FaEye /> : <FaEyeSlash />}
                </button>

                <div className="flex gap-0.5">
                    <button
                        className="w-5 h-5 p-0 flex items-center justify-center text-[10px] border-0 rounded cursor-pointer bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={(e) => handleControlClick(e, onMoveUp)}
                        title="Move up"
                        aria-label="Move up"
                        disabled={index === 0}
                    >
                        <FaArrowUp />
                    </button>
                    <button
                        className="w-5 h-5 p-0 flex items-center justify-center text-[10px] border-0 rounded cursor-pointer bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={(e) => handleControlClick(e, onMoveDown)}
                        title="Move down"
                        aria-label="Move down"
                        disabled={index === totalElements - 1}
                    >
                        <FaArrowDown />
                    </button>
                </div>
                <button
                    className="px-1.5 py-0.5 text-[10px] border-0 rounded cursor-pointer bg-white/10 hover:bg-white/20 flex items-center"
                    onClick={(e) => handleControlClick(e, onDuplicate)}
                    title="Duplicate element"
                    aria-label="Duplicate element"
                >
                    <FaClone />
                </button>
                <button
                    className="px-1.5 py-0.5 text-[10px] border-0 rounded cursor-pointer bg-white/10 hover:bg-white/20 flex items-center"
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

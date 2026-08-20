import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { sceneElementRegistry } from '@core/scene/registry';

interface CreateElementPopupProps {
    position: { x: number; y: number };
    onAddElement: (elementType: string) => void;
    onClose: () => void;
}

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;
const VIEWPORT_MARGIN = 8;

const formatCategory = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

const CreateElementPopup: React.FC<CreateElementPopupProps> = ({ position, onAddElement, onClose }) => {
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const elementTypes = useMemo(
        () =>
            sceneElementRegistry
                .getElementTypeInfo()
                .sort(
                    (left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name)
                ),
        []
    );

    const filteredTypes = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return elementTypes;
        return elementTypes.filter((elementType) =>
            [elementType.name, elementType.type, elementType.category, elementType.description].some((value) =>
                value.toLowerCase().includes(query)
            )
        );
    }, [elementTypes, search]);

    useEffect(() => {
        setActiveIndex(0);
    }, [search]);

    useEffect(() => {
        const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;
        item?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    const selectElementType = (elementType: string) => {
        onAddElement(elementType);
        onClose();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (filteredTypes.length > 0) {
                setActiveIndex((index) => Math.min(index + 1, filteredTypes.length - 1));
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const selected = filteredTypes[activeIndex];
            if (selected) selectElementType(selected.type);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        }
    };

    const viewportWidth = typeof window === 'undefined' ? POPUP_WIDTH + VIEWPORT_MARGIN * 2 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? POPUP_MAX_HEIGHT + VIEWPORT_MARGIN * 2 : window.innerHeight;
    const x = Math.max(VIEWPORT_MARGIN, Math.min(position.x, viewportWidth - POPUP_WIDTH - VIEWPORT_MARGIN));
    const y = Math.max(VIEWPORT_MARGIN, Math.min(position.y, viewportHeight - POPUP_MAX_HEIGHT - VIEWPORT_MARGIN));

    return (
        <FloatingPortal>
            <div className="fixed inset-0 z-[999]" onMouseDown={onClose} data-testid="create-element-backdrop" />
            <div
                className="fixed z-[1000] overflow-hidden rounded border border-neutral-700 bg-[#252526] shadow-2xl"
                style={{ left: x, top: y, width: POPUP_WIDTH }}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Add Element"
            >
                <div className="border-b border-neutral-700/80 px-3 pb-2 pt-2.5">
                    <p className="mb-1.5 select-none text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Add Element
                    </p>
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search elements…"
                        autoFocus
                        className="w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-[13px] text-neutral-200 outline-none transition-colors placeholder-neutral-500 focus:border-sky-500"
                    />
                </div>

                <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
                    {filteredTypes.length === 0 ? (
                        <div className="select-none px-3 py-2 text-[12px] text-neutral-500">No matching elements</div>
                    ) : (
                        filteredTypes.map((elementType, index) => (
                            <button
                                key={elementType.type}
                                type="button"
                                className={`flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors ${
                                    index === activeIndex ? 'bg-neutral-700/70' : 'hover:bg-neutral-700/40'
                                }`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => selectElementType(elementType.type)}
                                title={elementType.description}
                            >
                                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-sm bg-sky-500" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] text-neutral-200">
                                        {elementType.name}
                                    </span>
                                    <span className="block truncate text-[11px] text-neutral-500">
                                        {formatCategory(elementType.category)} · {elementType.description}
                                    </span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </FloatingPortal>
    );
};

export default CreateElementPopup;

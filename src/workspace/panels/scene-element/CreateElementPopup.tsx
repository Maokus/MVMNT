import React, { useMemo, useState, useCallback } from 'react';
import { FloatingPortal } from '@floating-ui/react';
import { sceneElementRegistry } from '@core/scene/registry';
import { clampPopupToViewport } from '@workspace/components/popupPosition';
import { useSearchableList } from '@workspace/components/useSearchableList';

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

    const selectElementType = useCallback(
        (elementType: string) => {
            onAddElement(elementType);
            onClose();
        },
        [onAddElement, onClose]
    );

    const { activeIndex, setActiveIndex, listRef, handleKeyDown } = useSearchableList({
        items: filteredTypes,
        search,
        onSelect: (elementType) => selectElementType(elementType.type),
        onEscape: onClose,
    });

    const viewportWidth = typeof window === 'undefined' ? POPUP_WIDTH + VIEWPORT_MARGIN * 2 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? POPUP_MAX_HEIGHT + VIEWPORT_MARGIN * 2 : window.innerHeight;
    const { x, y } = clampPopupToViewport(
        position,
        POPUP_WIDTH,
        viewportWidth,
        POPUP_MAX_HEIGHT,
        viewportHeight,
        VIEWPORT_MARGIN
    );

    return (
        <FloatingPortal>
            <div className="fixed inset-0 z-[999]" onMouseDown={onClose} data-testid="create-element-backdrop" />
            <div
                className="fixed z-[1000] overflow-hidden rounded border border-neutral-800 bg-[#252526] "
                style={{ left: x, top: y, width: POPUP_WIDTH }}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Add Element"
            >
                <div className="border-b border-neutral-800/80 px-3 pb-2 pt-2.5">
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
                                    index === activeIndex ? 'bg-neutral-800' : 'hover:bg-neutral-800'
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

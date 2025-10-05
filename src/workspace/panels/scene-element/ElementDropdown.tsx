import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { FaChevronLeft } from 'react-icons/fa';
import { sceneElementRegistry } from '@core/scene/registry/scene-element-registry';

interface ElementDropdownProps {
    onAddElement: (elementType: string) => void;
    onClose: () => void;
}

const SAFE_ZONE_WIDTH = 20;
const SUBMENU_GAP = 8;
const WALKWAY_WIDTH = SAFE_ZONE_WIDTH + SUBMENU_GAP;

const ElementDropdown: React.FC<ElementDropdownProps> = ({ onAddElement, onClose }) => {
    const types = useMemo(() => sceneElementRegistry.getElementTypeInfo(), []);

    const categories = useMemo(() => {
        const grouped: Record<string, any[]> = {};
        for (const type of types as any[]) {
            const category = type.category || 'other';
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(type);
        }
        return grouped;
    }, [types]);

    const sortedCategories = useMemo(() => Object.keys(categories).sort((a, b) => a.localeCompare(b)), [categories]);
    const categoryEntries = useMemo(
        () => sortedCategories.map((category) => ({
            category,
            items: [...(categories[category] ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        })),
        [categories, sortedCategories]
    );
    const [openCategory, setOpenCategory] = useState<string | null>(null);
    const [submenuTop, setSubmenuTop] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const closeTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        setOpenCategory((current) => {
            if (!current || sortedCategories.includes(current)) {
                return current;
            }
            return null;
        });
    }, [sortedCategories]);

    useEffect(() => {
        if (!openCategory) {
            setSubmenuTop(0);
        }
    }, [openCategory]);

    const clearCloseTimeout = useCallback(() => {
        if (closeTimeoutRef.current !== null) {
            window.clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    }, []);

    const scheduleClose = useCallback(() => {
        clearCloseTimeout();
        closeTimeoutRef.current = window.setTimeout(() => {
            setOpenCategory(null);
        }, 200);
    }, [clearCloseTimeout]);

    useEffect(() => () => clearCloseTimeout(), [clearCloseTimeout]);

    const handleCategoryEnter = (category: string, event: React.MouseEvent<HTMLButtonElement>) => {
        clearCloseTimeout();
        setOpenCategory(category);
        setSubmenuTop(event.currentTarget.offsetTop);
    };

    const handleCategoryFocus = (category: string, event: React.FocusEvent<HTMLButtonElement>) => {
        setOpenCategory(category);
        setSubmenuTop(event.currentTarget.offsetTop);
    };

    const handleItemClick = (elementType: string) => {
        onAddElement(elementType);
        onClose();
    };

    const formattedCategoryName = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);
    const openItems = useMemo(() => {
        if (!openCategory) {
            return [];
        }
        const entry = categoryEntries.find((item) => item.category === openCategory);
        return entry ? entry.items : [];
    }, [categoryEntries, openCategory]);

    return (
        <div
            ref={dropdownRef}
            className="absolute top-full right-0 z-[1000] mt-1 overflow-visible rounded border border-control2 bg-menubar shadow-lg"
            onMouseLeave={scheduleClose}
            onMouseEnter={clearCloseTimeout}
        >
            <div className="relative flex items-start">
                <div className="flex max-h-[320px] min-w-[200px] flex-col overflow-y-auto border-r border-control2 bg-menubar">
                    {categoryEntries.map(({ category }) => (
                        <button
                            type="button"
                            key={category}
                            onMouseEnter={(event) => handleCategoryEnter(category, event)}
                            onFocus={(event) => handleCategoryFocus(category, event)}
                            className={`flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
                                openCategory === category
                                    ? 'bg-neutral-800/80 text-white'
                                    : 'text-neutral-300 hover:bg-neutral-800/70 hover:text-white'
                            }`}
                        >
                            <FaChevronLeft className="text-xs opacity-70" />
                            <span className="font-medium">{formattedCategoryName(category)}</span>
                        </button>
                    ))}
                </div>

                {openCategory && openItems.length > 0 && (
                    <>
                        <div
                            aria-hidden
                            className="pointer-events-auto absolute top-0 bottom-0"
                            style={{
                                left: `-${WALKWAY_WIDTH}px`,
                                width: WALKWAY_WIDTH,
                            }}
                        />
                        <div
                            className="absolute min-w-[220px] rounded border border-control2 bg-panel shadow-xl"
                            style={{
                                top: submenuTop,
                                left: 0,
                                transform: `translateX(calc(-100% - ${WALKWAY_WIDTH}px))`,
                            }}
                        >
                            <div className="rounded bg-panel/90 p-1">
                                {openItems.map((type: any) => (
                                    <button
                                        type="button"
                                        key={type.type}
                                        onClick={() => handleItemClick(type.type)}
                                        className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-[13px] text-neutral-200 transition-colors hover:bg-neutral-800/70 hover:text-white"
                                        title={type.description}
                                    >
                                        <span>{type.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ElementDropdown;

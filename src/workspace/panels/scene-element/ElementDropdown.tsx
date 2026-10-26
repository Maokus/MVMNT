import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { FaChevronLeft } from 'react-icons/fa';
import { sceneElementRegistry } from '@core/scene/registry';

interface ElementDropdownProps {
    onAddElement: (elementType: string) => void;
    onClose: () => void;
    className?: string;
    style?: React.CSSProperties;
}

const SAFE_ZONE_WIDTH = 20;
const SUBMENU_GAP = 8;
const WALKWAY_WIDTH = SAFE_ZONE_WIDTH + SUBMENU_GAP;

const ElementDropdown: React.FC<ElementDropdownProps> = ({ onAddElement, onClose, className, style }) => {
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

    const sortedCategories = useMemo(() => {
        const isPluginCategory = (cat: string) => (categories[cat] ?? []).some((t: any) => t.pluginId != null);
        return Object.keys(categories).sort((a, b) => {
            const aPlugin = isPluginCategory(a);
            const bPlugin = isPluginCategory(b);
            if (aPlugin !== bPlugin) return aPlugin ? 1 : -1;
            return a.localeCompare(b);
        });
    }, [categories]);
    const categoryEntries = useMemo(
        () =>
            sortedCategories.map((category) => ({
                category,
                items: [...(categories[category] ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
            })),
        [categories, sortedCategories]
    );
    const [openCategory, setOpenCategory] = useState<string | null>(null);
    const [submenuTop, setSubmenuTop] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const innerWrapperRef = useRef<HTMLDivElement>(null);
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
        const buttonRect = event.currentTarget.getBoundingClientRect();
        const wrapperRect = innerWrapperRef.current?.getBoundingClientRect();
        setSubmenuTop(wrapperRect ? buttonRect.top - wrapperRect.top : event.currentTarget.offsetTop);
    };

    const handleCategoryFocus = (category: string, event: React.FocusEvent<HTMLButtonElement>) => {
        setOpenCategory(category);
        const buttonRect = event.currentTarget.getBoundingClientRect();
        const wrapperRect = innerWrapperRef.current?.getBoundingClientRect();
        setSubmenuTop(wrapperRect ? buttonRect.top - wrapperRect.top : event.currentTarget.offsetTop);
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
            className={`relative z-[1000] overflow-visible rounded border border-neutral-800 bg-panel ${className ?? ''}`}
            style={style}
            onMouseLeave={scheduleClose}
            onMouseEnter={clearCloseTimeout}
        >
            <div ref={innerWrapperRef} className="relative flex items-start">
                <div className="flex max-h-[320px] min-w-[200px] flex-col overflow-y-auto rounded bg-panel">
                    {categoryEntries.map(({ category }) => (
                        <button
                            type="button"
                            key={category}
                            onMouseEnter={(event) => handleCategoryEnter(category, event)}
                            onFocus={(event) => handleCategoryFocus(category, event)}
                            className="workspace-menu-item gap-2 px-2 py-2 text-[13px]"
                            data-active={openCategory === category}
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
                            className="absolute min-w-[220px] overflow-hidden rounded border border-neutral-800 bg-panel"
                            style={{
                                top: submenuTop,
                                left: 0,
                                transform: `translateX(calc(-100% - ${WALKWAY_WIDTH}px))`,
                            }}
                        >
                            <div>
                                {openItems.map((type: any) => (
                                    <button
                                        type="button"
                                        key={type.type}
                                        onClick={() => handleItemClick(type.type)}
                                        className="workspace-menu-item justify-between gap-2 px-2 py-2 text-[13px]"
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

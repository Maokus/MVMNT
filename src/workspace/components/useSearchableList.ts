import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface UseSearchableListOptions<T> {
    items: readonly T[];
    search: string;
    onSelect: (item: T) => void;
    onEscape: () => void;
}

export function useSearchableList<T>({ items, search, onSelect, onEscape }: UseSearchableListOptions<T>) {
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setActiveIndex(0);
    }, [search]);

    useEffect(() => {
        if (!listRef.current) return;
        const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
        item?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (items.length > 0) {
                setActiveIndex((index) => Math.min(index + 1, items.length - 1));
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const selected = items[activeIndex];
            if (selected !== undefined) onSelect(selected);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onEscape();
        }
    };

    return { activeIndex, setActiveIndex, listRef, handleKeyDown };
}

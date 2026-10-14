import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchableList } from '../useSearchableList';

const ITEMS = ['apple', 'apricot', 'banana'];

function Harness({ onSelect, onEscape }: { onSelect: (item: string) => void; onEscape: () => void }) {
    const [search, setSearch] = useState('');
    const filtered = ITEMS.filter((item) => item.includes(search));
    const { activeIndex, setActiveIndex, listRef, handleKeyDown } = useSearchableList({
        items: filtered,
        search,
        onSelect,
        onEscape,
    });
    return (
        <>
            <input aria-label="search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={handleKeyDown} />
            <div ref={listRef}>
                {filtered.map((item, index) => (
                    <button key={item} type="button" onMouseEnter={() => setActiveIndex(index)}>
                        {item}
                        {index === activeIndex ? ' (active)' : ''}
                    </button>
                ))}
            </div>
        </>
    );
}

describe('useSearchableList', () => {
    afterEach(() => {
        cleanup();
    });

    it('resets active index when the search changes', () => {
        render(<Harness onSelect={() => {}} onEscape={() => {}} />);
        const search = screen.getByLabelText('search');
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        expect(screen.getByText(/apricot \(active\)/)).toBeInTheDocument();
        fireEvent.change(search, { target: { value: 'b' } });
        expect(screen.getByText(/banana \(active\)/)).toBeInTheDocument();
    });

    it('selects the active item on Enter and closes on Escape', () => {
        const onSelect = vi.fn();
        const onEscape = vi.fn();
        render(<Harness onSelect={onSelect} onEscape={onEscape} />);
        const search = screen.getByLabelText('search');
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        fireEvent.keyDown(search, { key: 'Enter' });
        expect(onSelect).toHaveBeenCalledWith('apricot');
        fireEvent.keyDown(search, { key: 'Escape' });
        expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it('clamps navigation at both ends of the list', () => {
        render(<Harness onSelect={() => {}} onEscape={() => {}} />);
        const search = screen.getByLabelText('search');
        fireEvent.keyDown(search, { key: 'ArrowUp' });
        expect(screen.getByText(/apple \(active\)/)).toBeInTheDocument();
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        fireEvent.keyDown(search, { key: 'ArrowDown' });
        expect(screen.getByText(/banana \(active\)/)).toBeInTheDocument();
    });
});

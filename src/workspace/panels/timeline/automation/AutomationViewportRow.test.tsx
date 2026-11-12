import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationViewportRow } from './AutomationViewportRow';

let entries: IntersectionObserverCallback;
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();
function mockObserver() {
    const ctor = vi.fn(function (callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
        entries = callback;
        return { observe, unobserve, disconnect };
    });
    vi.stubGlobal('IntersectionObserver', ctor);
    return ctor;
}
function visibility(element: Element, isIntersecting: boolean) {
    act(() => entries([{ target: element, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
}
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('automation viewport rows', () => {
    it('shares an observer and mounts only visible editors while retaining row height', () => {
        const ctor = mockObserver();
        const { container, unmount } = render(
            <div data-timeline-scroll-viewport>
                <AutomationViewportRow height={28}>
                    <span>First editor</span>
                </AutomationViewportRow>
                <AutomationViewportRow height={120}>
                    <span>Second editor</span>
                </AutomationViewportRow>
            </div>
        );
        const rows = container.querySelectorAll('[data-automation-viewport-row]');
        expect(ctor).toHaveBeenCalledTimes(1);
        expect(ctor.mock.calls[0][1]).toMatchObject({ rootMargin: '200px 0px' });
        expect(screen.queryByText('First editor')).not.toBeInTheDocument();
        expect(rows[1]).toHaveStyle({ height: '120px' });
        visibility(rows[0], true);
        expect(screen.getByText('First editor')).toBeInTheDocument();
        expect(screen.queryByText('Second editor')).not.toBeInTheDocument();
        visibility(rows[0], false);
        expect(screen.queryByText('First editor')).not.toBeInTheDocument();
        expect(rows[0]).toHaveStyle({ height: '28px' });
        unmount();
        expect(unobserve).toHaveBeenCalledTimes(2);
        expect(disconnect).toHaveBeenCalledOnce();
    });

    it('keeps a dragged editor mounted until pointer release, including outside its viewport', () => {
        mockObserver();
        const { container } = render(
            <div data-timeline-scroll-viewport>
                <AutomationViewportRow height={28}>
                    <span>Drag</span>
                </AutomationViewportRow>
            </div>
        );
        const row = container.querySelector('[data-automation-viewport-row]')!;
        visibility(row, true);
        fireEvent.pointerDown(screen.getByText('Drag'));
        visibility(row, false);
        expect(screen.getByText('Drag')).toBeInTheDocument();
        fireEvent.pointerUp(window);
        expect(screen.queryByText('Drag')).not.toBeInTheDocument();
    });

    it('keeps a focused input mounted until focus leaves the editor', () => {
        mockObserver();
        const { container } = render(
            <div data-timeline-scroll-viewport>
                <AutomationViewportRow height={120}>
                    <input aria-label="Range" />
                </AutomationViewportRow>
            </div>
        );
        const row = container.querySelector('[data-automation-viewport-row]')!;
        visibility(row, true);
        fireEvent.focus(screen.getByRole('textbox'));
        visibility(row, false);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
        fireEvent.blur(screen.getByRole('textbox'), { relatedTarget: document.body });
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('renders normally outside a timeline viewport', () => {
        mockObserver();
        render(
            <AutomationViewportRow height={28}>
                <span>Standalone</span>
            </AutomationViewportRow>
        );
        expect(screen.getByText('Standalone')).toBeInTheDocument();
        expect(observe).not.toHaveBeenCalled();
    });
});

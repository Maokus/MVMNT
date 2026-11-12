import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type VisibilityListener = (visible: boolean) => void;
const observers = new WeakMap<
    Element,
    { observer: IntersectionObserver; listeners: Map<Element, VisibilityListener> }
>();

function observeRow(element: Element, root: Element, listener: VisibilityListener) {
    let shared = observers.get(root);
    if (!shared) {
        const listeners = new Map<Element, VisibilityListener>();
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
            },
            { root, rootMargin: '200px 0px' }
        );
        shared = { observer, listeners };
        observers.set(root, shared);
    }
    shared.listeners.set(element, listener);
    shared.observer.observe(element);
    return () => {
        shared.listeners.delete(element);
        shared.observer.unobserve(element);
        if (shared.listeners.size === 0) {
            shared.observer.disconnect();
            observers.delete(root);
        }
    };
}

/** Retain layout and interaction targets while offscreen SVG editors are unmounted. */
export function AutomationViewportRow({ height, children }: { height: number; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
    const [interacting, setInteracting] = useState(false);
    const [focused, setFocused] = useState(false);
    useLayoutEffect(() => {
        const element = ref.current;
        const root = element?.closest('[data-timeline-scroll-viewport]');
        if (!element || !root || typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        return observeRow(element, root, setVisible);
    }, []);
    useEffect(() => {
        if (!interacting) return;
        const finish = () => setInteracting(false);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
        window.addEventListener('blur', finish);
        return () => {
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            window.removeEventListener('blur', finish);
        };
    }, [interacting]);
    return (
        <div
            ref={ref}
            data-automation-viewport-row
            style={{ height }}
            onPointerDownCapture={() => setInteracting(true)}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
            }}
        >
            {visible || interacting || focused ? children : null}
        </div>
    );
}

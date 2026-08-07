import { useEffect, useRef } from 'react';

/** Ownership domains are ordered by their default priority, not DOM position. */
export type ShortcutDomain = 'modal' | 'focused-control' | 'document' | 'undo' | 'transport' | 'timeline' | 'scene';

const DOMAIN_PRIORITY: Record<ShortcutDomain, number> = {
    modal: 700,
    'focused-control': 600,
    document: 500,
    undo: 400,
    transport: 300,
    timeline: 200,
    scene: 100,
};

export interface ShortcutRegistration {
    id: string;
    domain: ShortcutDomain;
    /** Higher values run first within a domain. */
    priority?: number;
    enabled?: boolean;
    matches: (event: KeyboardEvent) => boolean;
    /** Return true only after claiming the event. */
    handle: (event: KeyboardEvent) => boolean | void;
}

type RegisteredShortcut = ShortcutRegistration & { sequence: number };

const registrations = new Map<string, RegisteredShortcut>();
let sequence = 0;
let listening = false;

function orderedRegistrations(): RegisteredShortcut[] {
    return [...registrations.values()].sort((left, right) => {
        const priority =
            DOMAIN_PRIORITY[right.domain] +
            (right.priority ?? 0) -
            (DOMAIN_PRIORITY[left.domain] + (left.priority ?? 0));
        return priority || left.sequence - right.sequence;
    });
}

function onKeyDown(event: KeyboardEvent) {
    for (const registration of orderedRegistrations()) {
        if (registration.enabled === false || !registration.matches(event)) continue;
        if (registration.handle(event)) return;
    }
}

function startListening() {
    if (listening || typeof window === 'undefined') return;
    window.addEventListener('keydown', onKeyDown, { capture: true });
    listening = true;
}

function stopListening() {
    if (!listening || typeof window === 'undefined') return;
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    listening = false;
}

export function registerGlobalShortcut(registration: ShortcutRegistration): () => void {
    if (registrations.has(registration.id)) {
        throw new Error(`Duplicate global shortcut registration: ${registration.id}`);
    }
    registrations.set(registration.id, { ...registration, sequence: sequence++ });
    startListening();
    return () => {
        registrations.delete(registration.id);
        if (!registrations.size) stopListening();
    };
}

/** Register a live React callback without adding a listener for each component. */
export function useGlobalShortcut(registration: ShortcutRegistration): void {
    const registrationRef = useRef(registration);
    registrationRef.current = registration;
    useEffect(() => {
        return registerGlobalShortcut({
            ...registration,
            matches: (event) => registrationRef.current.matches(event),
            handle: (event) => registrationRef.current.handle(event),
        });
        // The ref makes the registration live; only its stable ownership changes require re-registration.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registration.id]);
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return Boolean(
        element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]')
    );
}

export function isNavigationTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return Boolean(element?.closest('[role="tree"], [role="grid"], [role="listbox"]'));
}

/** Test-only reset for module-level registrations created outside React. */
export function resetGlobalShortcutsForTest(): void {
    registrations.clear();
    stopListening();
    sequence = 0;
}

import { useEffect, useRef } from 'react';

export interface CommandMetadata {
    id: string;
    title: string;
    category: string;
    defaultShortcut?: string;
}

export interface CommandState {
    enabled: boolean;
}

interface CommandHandler {
    run: (args?: unknown) => void | boolean | Promise<void | boolean>;
    getState: (args?: unknown) => CommandState;
}

const definitions = new Map<string, CommandMetadata>();
const handlers = new Map<string, CommandHandler>();

export function defineCommand(metadata: CommandMetadata): void {
    const current = definitions.get(metadata.id);
    if (current && JSON.stringify(current) !== JSON.stringify(metadata)) {
        throw new Error(`Conflicting command definition: ${metadata.id}`);
    }
    definitions.set(metadata.id, metadata);
}

export function getCommandMetadata(id: string): CommandMetadata | undefined {
    return definitions.get(id);
}

export function getCommandState(id: string, args?: unknown): CommandState {
    return handlers.get(id)?.getState(args) ?? { enabled: false };
}

export function executeCommand(id: string, args?: unknown): boolean {
    const handler = handlers.get(id);
    if (!handler || !handler.getState(args).enabled) return false;
    void handler.run(args);
    return true;
}

export function registerCommandHandler(id: string, handler: CommandHandler): () => void {
    if (handlers.has(id)) throw new Error(`Duplicate command handler registration: ${id}`);
    handlers.set(id, handler);
    return () => handlers.delete(id);
}

export function useCommandHandler(id: string, handler: CommandHandler): void {
    const ref = useRef(handler);
    ref.current = handler;
    useEffect(
        () =>
            registerCommandHandler(id, {
                run: (args) => ref.current.run(args),
                getState: (args) => ref.current.getState(args),
            }),
        [id]
    );
}

export function resetCommandsForTest(): void {
    handlers.clear();
}

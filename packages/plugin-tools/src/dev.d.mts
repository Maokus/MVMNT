import type { Server } from 'node:http';
export function startPluginDevServer(
    inputDirectories: readonly string[],
    options?: { port?: number }
): Promise<{ server: Server; port: number; close(): void }>;

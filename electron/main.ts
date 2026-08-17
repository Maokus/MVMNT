import {
    access,
    mkdir,
    open,
    readFile,
    readdir,
    rename,
    rm,
    stat,
    statfs,
    writeFile,
    type FileHandle,
} from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    net,
    Notification,
    protocol,
    session,
    shell,
    utilityProcess,
    type MenuItemConstructorOptions,
} from 'electron';
import started from 'electron-squirrel-startup';
import { createBuildInfo, resolveUpdateAvailability, type UpdateCheckResult } from './shared/build-info.js';
import type {
    CloseRequestResult,
    DesktopMenuCommand,
    DesktopOpenKind,
    DesktopOpenResult,
    DesktopRecentDocument,
    DesktopRenameRequest,
    DesktopRenameResult,
    DesktopSaveRequest,
    DesktopSaveResult,
    DesktopSaveAsSelectionRequest,
    DesktopSaveAsSelectionResult,
    DesktopWriteSaveAsRequest,
    DesktopExportBeginRequest,
    DesktopExportBeginResult,
    DesktopExportCompleteRequest,
    DesktopExportCompleteResult,
    DesktopExportWriteRequest,
    DesktopExportDestinationRequest,
    DesktopExportDestinationResult,
    DesktopDroppedFile,
    DesktopStorageReport,
    DesktopBackgroundExportRequest,
    DesktopBackgroundExportUpdate,
} from './shared/desktop-api.js';
import {
    parseDeepLink,
    parseRenderCommand,
    type DesktopAutomationProgress,
    type DesktopAutomationResult,
    type DesktopDeepLinkCommand,
    type ParsedRenderCommand,
} from './shared/automation.js';
import {
    PROJECT_EXTENSION,
    PLUGIN_EXTENSION,
    ensureProjectExtension,
    isSupportedOpenPath,
    resolveRendererPath,
    sanitizeSuggestedName,
} from './shared/path-security.js';

const APP_SCHEME = 'mvmnt';
const APP_ORIGIN = `${APP_SCHEME}://app`;
const isDevelopment = Boolean(process.env.MVMNT_RENDERER_URL);
const RELEASES_LATEST_URL = 'https://github.com/Maokus/MVMNT/releases/latest';
const postHogCspConnectSrc = __POSTHOG_CSP_CONNECT_SRC__;
const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/Maokus/MVMNT/releases/latest';
const buildInfo = createBuildInfo({
    version: __MVMNT_VERSION__,
    channel: __MVMNT_BUILD_CHANNEL__,
    commit: __MVMNT_BUILD_SHA__,
    builtAt: __MVMNT_BUILD_DATE__,
    isPackaged: app.isPackaged,
    platform: process.platform,
});
if (buildInfo.channel === 'nightly') app.setName('MVMNT Nightly');
let updateCheck: Promise<UpdateCheckResult> | null = null;
let renderCommand: ParsedRenderCommand | null = null;
let renderArgumentError: string | null = null;
try {
    renderCommand = parseRenderCommand(process.argv);
} catch (error) {
    renderArgumentError = error instanceof Error ? error.message : String(error);
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: APP_SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true,
            codeCache: true,
        },
    },
]);

let mainWindow: BrowserWindow | null = null;
let activeDocumentPath: string | null = null;
let pendingOpenPath: string | null = null;
interface RecentDocumentRecord extends DesktopRecentDocument {
    path: string;
}
let recentDocuments: RecentDocumentRecord[] = [];
let pendingSaveAs: { id: string; targetPath: string } | null = null;
let documentDirty = false;
let allowClose = false;
let closeRequestPending = false;
let rendererReady = false;
const queuedOpenPaths: string[] = [];
interface ExportSession {
    id: string;
    kind: 'video' | 'image-sequence' | 'audio';
    targetPath: string;
    temporaryPath: string;
    displayName: string;
    handle?: FileHandle;
    bytesWritten: number;
    artifactsTemporaryPath?: string;
    artifactsTargetPath?: string;
}
const exportSessions = new Map<string, ExportSession>();
const completedExports = new Map<string, string>();
interface BackgroundExportHost {
    request: DesktopBackgroundExportRequest;
    window: BrowserWindow;
}
const backgroundExportHosts = new Map<string, BackgroundExportHost>();
let pendingDeepLink: DesktopDeepLinkCommand | null = null;
let renderRequestDelivered = false;

const DROP_RULES: Array<{ extensions: string[]; category: DesktopDroppedFile['category']; maxBytes: number }> = [
    { extensions: ['.mvt'], category: 'project', maxBytes: 1024 * 1024 * 1024 },
    { extensions: ['.mvmnt-plugin'], category: 'plugin', maxBytes: 100 * 1024 * 1024 },
    { extensions: ['.mid', '.midi'], category: 'midi', maxBytes: 100 * 1024 * 1024 },
    {
        extensions: ['.wav', '.mp3', '.ogg', '.flac', '.aac', '.m4a'],
        category: 'audio',
        maxBytes: 4 * 1024 * 1024 * 1024,
    },
    { extensions: ['.png', '.jpg', '.jpeg', '.webp', '.gif'], category: 'image', maxBytes: 512 * 1024 * 1024 },
    { extensions: ['.ttf', '.otf', '.woff', '.woff2'], category: 'font', maxBytes: 100 * 1024 * 1024 },
];

function exportLedgerPath(): string {
    return join(app.getPath('userData'), 'active-exports.json');
}

async function persistExportSessions(): Promise<void> {
    const entries = [...exportSessions.values()].map(
        ({ id, kind, temporaryPath, displayName, artifactsTemporaryPath }) => ({
            id,
            kind,
            temporaryPath,
            displayName,
            artifactsTemporaryPath,
        })
    );
    await writeFile(exportLedgerPath(), JSON.stringify({ version: 1, entries }), 'utf8').catch(() => undefined);
}

async function cleanupInterruptedExports(): Promise<void> {
    try {
        const value = JSON.parse(await readFile(exportLedgerPath(), 'utf8')) as {
            entries?: Array<{ temporaryPath?: unknown; artifactsTemporaryPath?: unknown }>;
        };
        for (const entry of value.entries ?? []) {
            for (const candidate of [entry.temporaryPath, entry.artifactsTemporaryPath]) {
                if (typeof candidate !== 'string') continue;
                const name = basename(candidate);
                if (!name.startsWith('.mvmnt-export-')) continue;
                await rm(candidate, { recursive: true, force: true }).catch(() => undefined);
            }
        }
        await writeFile(exportLedgerPath(), JSON.stringify({ version: 1, entries: [] }), 'utf8');
    } catch {}
}

function automationOutput(
    value: DesktopAutomationProgress | DesktopAutomationResult | { type: 'error'; code: string; message: string }
): void {
    if (renderCommand?.json) process.stdout.write(`${JSON.stringify(value)}\n`);
    else if (value.type === 'progress') process.stdout.write(`[${Math.round(value.progress)}%] ${value.message}\n`);
    else if (value.type === 'complete')
        process.stdout.write(`Export complete${value.outputName ? `: ${value.outputName}` : ''}\n`);
    else process.stderr.write(`${value.code}: ${value.message}\n`);
}

function finishAutomation(result: DesktopAutomationResult): void {
    automationOutput(result);
    allowClose = true;
    const exitCode = result.type === 'complete' ? 0 : result.code === 'input' ? 3 : result.code === 'output' ? 5 : 4;
    setImmediate(() => app.exit(exitCode));
}

async function directorySummary(directory: string): Promise<{ count: number; bytes: number; available: boolean }> {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        let count = 0;
        let bytes = 0;
        for (const entry of entries.slice(0, 2_000)) {
            const candidate = join(directory, entry.name);
            try {
                const info = await stat(candidate);
                count += 1;
                bytes += info.isFile() ? info.size : 0;
            } catch {}
        }
        return { count, bytes, available: true };
    } catch {
        return { count: 0, bytes: 0, available: false };
    }
}

async function inspectStorage(): Promise<DesktopStorageReport> {
    const userData = app.getPath('userData');
    const exportLedger = await directorySummary(dirname(exportLedgerPath()));
    let temporaryCount = 0;
    let temporaryBytes = 0;
    try {
        const entries = await readdir(userData, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.name.startsWith('.mvmnt-export-')) continue;
            temporaryCount += 1;
            try {
                temporaryBytes += (await stat(join(userData, entry.name))).size;
            } catch {}
        }
    } catch {}
    const updateCachePath = join(app.getPath('userData'), '..', 'SquirrelTemp');
    const updateCache = await directorySummary(updateCachePath);
    return {
        location: userData,
        temporaryExports: {
            count: temporaryCount,
            bytes: temporaryBytes || (exportSessions.size ? exportLedger.bytes : 0),
        },
        updateCache,
    };
}

async function cleanupStorage(category: unknown): Promise<DesktopStorageReport> {
    if (category === 'temporary-exports') {
        await cleanupInterruptedExports();
        const userData = app.getPath('userData');
        for (const entry of await readdir(userData).catch(() => [])) {
            if (entry.startsWith('.mvmnt-export-')) await rm(join(userData, entry), { recursive: true, force: true });
        }
    } else if (category === 'update-cache') {
        const updateCachePath = join(app.getPath('userData'), '..', 'SquirrelTemp');
        // This is an Electron/Squirrel-owned cache directory, never an
        // arbitrary renderer-supplied path.
        for (const entry of await readdir(updateCachePath).catch(() => [])) {
            await rm(join(updateCachePath, entry), { recursive: true, force: true });
        }
    } else {
        throw new Error('Unsupported storage cleanup category.');
    }
    return inspectStorage();
}

async function readDroppedFiles(value: unknown): Promise<DesktopDroppedFile[]> {
    if (!Array.isArray(value) || value.length > 32) throw new Error('Invalid dropped-file request.');
    const results: DesktopDroppedFile[] = [];
    for (const candidate of value) {
        if (typeof candidate !== 'string' || !candidate || candidate.includes('\0')) continue;
        const rule = DROP_RULES.find((item) => item.extensions.includes(extname(candidate).toLowerCase()));
        if (!rule) continue;
        const info = await stat(candidate);
        if (!info.isFile() || info.size <= 0 || info.size > rule.maxBytes)
            throw new Error(`${basename(candidate)} exceeds the allowed size.`);
        results.push({
            name: basename(candidate),
            category: rule.category,
            bytes: new Uint8Array(await readFile(candidate)),
        });
    }
    return results;
}

async function deliverRenderRequest(): Promise<void> {
    if (!renderCommand || renderRequestDelivered || !mainWindow) return;
    renderRequestDelivered = true;
    try {
        const inputPath = resolve(renderCommand.inputPath);
        if (extname(inputPath).toLowerCase() !== PROJECT_EXTENSION)
            throw new Error('Render input must be a .mvt project.');
        const info = await stat(inputPath);
        if (!info.isFile() || info.size <= 0 || info.size > 1024 * 1024 * 1024)
            throw new Error('Render input is empty or exceeds 1 GB.');
        mainWindow.webContents.send('automation:render-request', {
            inputName: basename(inputPath),
            bytes: new Uint8Array(await readFile(inputPath)),
            kind: renderCommand.kind,
            preset: renderCommand.preset,
            range: renderCommand.range,
            width: renderCommand.width,
            height: renderCommand.height,
            fps: renderCommand.fps,
        });
    } catch (error) {
        finishAutomation({
            type: 'error',
            code: 'input',
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(sourceDirectory, '..', '..');
const rendererRoot = join(appRoot, 'dist', 'renderer');
const execFileAsync = promisify(execFile);

async function updateWindowsFileAssociations(remove = false): Promise<void> {
    if (process.platform !== 'win32') return;
    const classes = [
        { extension: '.mvt', className: 'MVMNT.Project', description: 'MVMNT Project' },
        { extension: '.mvmnt-plugin', className: 'MVMNT.Plugin', description: 'MVMNT Plugin' },
    ];
    for (const entry of classes) {
        const extensionKey = `HKCU\\Software\\Classes\\${entry.extension}`;
        const classKey = `HKCU\\Software\\Classes\\${entry.className}`;
        if (remove) {
            await execFileAsync('reg.exe', ['delete', extensionKey, '/f']).catch(() => undefined);
            await execFileAsync('reg.exe', ['delete', classKey, '/f']).catch(() => undefined);
            continue;
        }
        const command = `"${process.execPath}" "%1"`;
        await execFileAsync('reg.exe', ['add', extensionKey, '/ve', '/d', entry.className, '/f']);
        await execFileAsync('reg.exe', ['add', classKey, '/ve', '/d', entry.description, '/f']);
        await execFileAsync('reg.exe', ['add', `${classKey}\\DefaultIcon`, '/ve', '/d', `${process.execPath},0`, '/f']);
        await execFileAsync('reg.exe', ['add', `${classKey}\\shell\\open\\command`, '/ve', '/d', command, '/f']);
    }
}

function removeWindowsFileAssociationsOnUninstall(): void {
    if (process.platform !== 'win32' || !process.argv.includes('--squirrel-uninstall')) return;
    for (const key of ['.mvt', '.mvmnt-plugin', 'MVMNT.Project', 'MVMNT.Plugin']) {
        try {
            execFileSync('reg.exe', ['delete', `HKCU\\Software\\Classes\\${key}`, '/f']);
        } catch {}
    }
    app.removeAsDefaultProtocolClient(APP_SCHEME);
}

async function persistDocumentState(): Promise<void> {
    const statePath = join(app.getPath('userData'), 'document-state.json');
    await writeFile(statePath, JSON.stringify({ activeDocumentPath }), 'utf8').catch(() => undefined);
}

async function restoreDocumentState(): Promise<void> {
    try {
        const statePath = join(app.getPath('userData'), 'document-state.json');
        const parsed = JSON.parse(await readFile(statePath, 'utf8')) as { activeDocumentPath?: unknown };
        if (typeof parsed.activeDocumentPath === 'string' && parsed.activeDocumentPath.endsWith(PROJECT_EXTENSION)) {
            activeDocumentPath = parsed.activeDocumentPath;
        }
    } catch {}
}

async function persistRecentDocuments(): Promise<void> {
    const statePath = join(app.getPath('userData'), 'recent-documents.json');
    await writeFile(statePath, JSON.stringify(recentDocuments), 'utf8').catch(() => undefined);
}

async function restoreRecentDocuments(): Promise<void> {
    try {
        const statePath = join(app.getPath('userData'), 'recent-documents.json');
        const parsed = JSON.parse(await readFile(statePath, 'utf8')) as unknown;
        if (!Array.isArray(parsed)) return;
        recentDocuments = parsed
            .flatMap((entry): RecentDocumentRecord[] => {
                if (!entry || typeof entry !== 'object') return [];
                const value = entry as Partial<RecentDocumentRecord>;
                if (typeof value.path !== 'string' || !value.path.toLowerCase().endsWith(PROJECT_EXTENSION)) return [];
                return [
                    {
                        path: value.path,
                        displayName: typeof value.displayName === 'string' ? value.displayName : basename(value.path),
                        openedAt: typeof value.openedAt === 'number' ? value.openedAt : 0,
                    },
                ];
            })
            .slice(0, 5);
    } catch {}
}

function rememberRecentDocument(filePath: string): void {
    if (!filePath.toLowerCase().endsWith(PROJECT_EXTENSION)) return;
    recentDocuments = [
        { path: filePath, displayName: basename(filePath), openedAt: Date.now() },
        ...recentDocuments.filter((entry) => entry.path !== filePath),
    ].slice(0, 5);
    void persistRecentDocuments();
}

async function listRecentDocuments(): Promise<DesktopRecentDocument[]> {
    const existing: RecentDocumentRecord[] = [];
    for (const entry of recentDocuments) {
        try {
            await access(entry.path);
            existing.push(entry);
        } catch {}
    }
    if (existing.length !== recentDocuments.length) {
        recentDocuments = existing;
        await persistRecentDocuments();
    }
    return existing.map(({ displayName, openedAt }) => ({ displayName, openedAt }));
}

async function openRecentDocument(value: unknown): Promise<DesktopOpenResult> {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= recentDocuments.length) {
        return { canceled: true };
    }
    const record = recentDocuments[value];
    try {
        return await readOpenPath(record.path);
    } catch {
        recentDocuments = recentDocuments.filter((entry) => entry.path !== record.path);
        await persistRecentDocuments();
        return { canceled: true };
    }
}

function openKindForPath(filePath: string): DesktopOpenKind {
    return filePath.toLowerCase().endsWith(PLUGIN_EXTENSION) ? 'plugin' : 'project';
}

function validateSaveRequest(value: unknown): DesktopSaveRequest {
    if (!value || typeof value !== 'object') throw new Error('Invalid save request.');
    const request = value as Partial<DesktopSaveRequest>;
    if (!(request.bytes instanceof Uint8Array)) throw new Error('Project data must be binary.');
    if (request.bytes.byteLength === 0) throw new Error('Project data is empty.');
    return { bytes: request.bytes, suggestedName: sanitizeSuggestedName(request.suggestedName) };
}

async function atomicWrite(filePath: string, bytes: Uint8Array): Promise<void> {
    const temporaryPath = join(
        dirname(filePath),
        `.${basename(filePath)}.${process.pid}.${Date.now().toString(36)}.tmp`
    );
    try {
        await writeFile(temporaryPath, bytes);
        await swapIntoPlace(temporaryPath, filePath);
    } catch (error) {
        try {
            const { rm } = await import('node:fs/promises');
            await rm(temporaryPath, { force: true });
        } catch {}
        throw error;
    }
}

async function swapIntoPlace(temporaryPath: string, targetPath: string): Promise<void> {
    try {
        await rename(temporaryPath, targetPath);
        return;
    } catch (error) {
        try {
            await access(targetPath);
        } catch {
            throw error;
        }
    }
    const backupPath = join(dirname(targetPath), `.mvmnt-export-backup-${randomToken()}`);
    await rename(targetPath, backupPath);
    try {
        await rename(temporaryPath, targetPath);
        await rm(backupPath, { recursive: true, force: true });
    } catch (error) {
        await rename(backupPath, targetPath).catch(() => undefined);
        throw error;
    }
}

function randomToken(): string {
    return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

function validateExportBegin(value: unknown): DesktopExportBeginRequest {
    if (!value || typeof value !== 'object') throw new Error('Invalid export request.');
    const request = value as Partial<DesktopExportBeginRequest>;
    if (request.kind !== 'video' && request.kind !== 'image-sequence' && request.kind !== 'audio') {
        throw new Error('Unsupported export kind.');
    }
    const allowedExtensions = new Set(['.mp4', '.webm', '.wav']);
    const extension = request.extension && allowedExtensions.has(request.extension) ? request.extension : undefined;
    return {
        kind: request.kind,
        suggestedName: sanitizeSuggestedName(request.suggestedName),
        extension,
        estimatedBytes:
            typeof request.estimatedBytes === 'number' && request.estimatedBytes > 0
                ? Math.floor(request.estimatedBytes)
                : undefined,
        outputDirectory:
            typeof request.outputDirectory === 'string' &&
            request.outputDirectory.trim() &&
            resolve(request.outputDirectory.trim()) === request.outputDirectory.trim()
                ? request.outputDirectory.trim()
                : undefined,
        outputPath:
            typeof request.outputPath === 'string' &&
            request.outputPath.trim() &&
            resolve(request.outputPath.trim()) === request.outputPath.trim()
                ? request.outputPath.trim()
                : undefined,
    };
}

async function chooseExportDestination(value: unknown): Promise<DesktopExportDestinationResult> {
    try {
        if (!mainWindow || !value || typeof value !== 'object') return { status: 'canceled' };
        const request = value as Partial<DesktopExportDestinationRequest>;
        if (request.kind !== 'video' && request.kind !== 'image-sequence') throw new Error('Unsupported export kind.');
        const extension =
            request.kind === 'video' && (request.extension === '.webm' || request.extension === '.mp4')
                ? request.extension
                : request.kind === 'video'
                  ? '.mp4'
                  : undefined;
        const stem = sanitizeSuggestedName(request.suggestedName ?? 'export').replace(/\.[^.]+$/, '') || 'export';
        const result = await dialog.showSaveDialog(mainWindow, {
            title: request.kind === 'image-sequence' ? 'Choose PNG sequence folder name' : 'Save export',
            defaultPath: request.kind === 'image-sequence' ? `${stem}_sequence` : `${stem}${extension}`,
            filters:
                request.kind === 'video'
                    ? [{ name: extension === '.webm' ? 'WebM video' : 'MP4 video', extensions: [extension!.slice(1)] }]
                    : [{ name: 'PNG sequence folder', extensions: ['png'] }],
            properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (result.canceled || !result.filePath) return { status: 'canceled' };
        return { status: 'selected', outputPath: result.filePath, displayName: basename(result.filePath) };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

async function hasEnoughDiskSpace(directory: string, estimatedBytes?: number): Promise<boolean> {
    if (!estimatedBytes) return true;
    try {
        const info = await statfs(directory);
        const available = Number(info.bavail) * Number(info.bsize);
        return available >= estimatedBytes * 1.1;
    } catch {
        return true;
    }
}

async function beginExport(value: unknown): Promise<DesktopExportBeginResult> {
    try {
        if (!mainWindow) return { status: 'canceled' };
        const request = validateExportBegin(value);
        const id = randomToken();
        let targetPath: string;
        let temporaryPath: string;
        let displayName: string;
        let handle: FileHandle | undefined;

        if (renderCommand) {
            targetPath = resolve(renderCommand.outputPath);
            if (request.kind === 'image-sequence') {
                displayName = basename(targetPath) || 'sequence';
                temporaryPath = join(dirname(targetPath), `.mvmnt-export-${id}`);
                try {
                    await access(targetPath);
                    throw new Error(`Output already exists: ${targetPath}`);
                } catch (error) {
                    if (error instanceof Error && error.message.startsWith('Output already exists:')) throw error;
                }
                await mkdir(dirname(targetPath), { recursive: true });
                await mkdir(temporaryPath, { recursive: false });
            } else {
                const extension = request.extension ?? '.mp4';
                if (!targetPath.toLowerCase().endsWith(extension))
                    throw new Error(`Output must end with ${extension}.`);
                displayName = basename(targetPath);
                await mkdir(dirname(targetPath), { recursive: true });
                temporaryPath = join(dirname(targetPath), `.mvmnt-export-${id}${extension}.tmp`);
                handle = await open(temporaryPath, 'wx+');
            }
        } else if (request.outputPath) {
            if (request.kind === 'image-sequence') {
                const folderName = basename(request.outputPath).replace(/\.(zip|png)$/i, '') || 'sequence';
                targetPath = join(dirname(request.outputPath), folderName);
                displayName = folderName;
                temporaryPath = join(dirname(request.outputPath), `.mvmnt-export-${id}`);
                await mkdir(dirname(request.outputPath), { recursive: true });
                await mkdir(temporaryPath, { recursive: false });
            } else {
                const extension = request.extension ?? (request.kind === 'audio' ? '.wav' : '.mp4');
                targetPath = request.outputPath.toLowerCase().endsWith(extension)
                    ? request.outputPath
                    : `${request.outputPath}${extension}`;
                displayName = basename(targetPath);
                temporaryPath = join(dirname(targetPath), `.mvmnt-export-${id}${extension}.tmp`);
                await mkdir(dirname(targetPath), { recursive: true });
                handle = await open(temporaryPath, 'w+');
            }
        } else if (!request.outputDirectory) {
            throw new Error('Choose a destination with the native file picker before starting a desktop export.');
        } else if (request.kind === 'image-sequence') {
            await mkdir(request.outputDirectory, { recursive: true });
            const folderName = sanitizeSuggestedName(request.suggestedName).replace(/\.(zip|png)$/i, '') || 'sequence';
            targetPath = join(request.outputDirectory, folderName);
            displayName = folderName;
            temporaryPath = join(request.outputDirectory, `.mvmnt-export-${id}`);
            await mkdir(temporaryPath, { recursive: false });
        } else {
            const extension = request.extension ?? (request.kind === 'audio' ? '.wav' : '.mp4');
            const base = sanitizeSuggestedName(request.suggestedName).replace(/\.[^.]+$/, '') || 'export';
            await mkdir(request.outputDirectory, { recursive: true });
            targetPath = join(request.outputDirectory, `${base}${extension}`);
            displayName = basename(targetPath);
            temporaryPath = join(request.outputDirectory, `.mvmnt-export-${id}${extension}.tmp`);
            handle = await open(temporaryPath, 'w+');
        }

        if (!(await hasEnoughDiskSpace(dirname(targetPath), request.estimatedBytes))) {
            await handle?.close().catch(() => undefined);
            await rm(temporaryPath, { force: true, recursive: request.kind === 'image-sequence' }).catch(
                () => undefined
            );
            return { status: 'error', error: 'The selected destination does not have enough free space.' };
        }
        exportSessions.set(id, {
            id,
            kind: request.kind,
            targetPath,
            temporaryPath,
            displayName,
            handle,
            bytesWritten: 0,
        });
        await persistExportSessions();
        return { status: 'ready', sessionId: id, displayName };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

function requireExportSession(sessionId: unknown): ExportSession {
    if (typeof sessionId !== 'string') throw new Error('Invalid export session.');
    const session = exportSessions.get(sessionId);
    if (!session) throw new Error('Export session is no longer active.');
    return session;
}

async function writeExport(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') throw new Error('Invalid export write.');
    const request = value as Partial<DesktopExportWriteRequest>;
    const session = requireExportSession(request.sessionId);
    if (!session.handle || !(request.bytes instanceof Uint8Array)) throw new Error('Invalid export bytes.');
    const position =
        Number.isSafeInteger(request.position) && request.position! >= 0 ? request.position! : session.bytesWritten;
    await session.handle.write(request.bytes, 0, request.bytes.byteLength, position);
    session.bytesWritten = Math.max(session.bytesWritten, position + request.bytes.byteLength);
}

async function writeExportFrame(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') throw new Error('Invalid frame write.');
    const request = value as Partial<DesktopExportWriteRequest>;
    const session = requireExportSession(request.sessionId);
    if (session.kind !== 'image-sequence' || !(request.bytes instanceof Uint8Array))
        throw new Error('Invalid frame bytes.');
    if (typeof request.filename !== 'string' || !/^frame_\d{5,9}\.png$/.test(request.filename)) {
        throw new Error('Invalid frame filename.');
    }
    await writeFile(join(session.temporaryPath, request.filename), request.bytes, { flag: 'wx' });
    session.bytesWritten += request.bytes.byteLength;
}

async function writeExportArtifact(value: unknown): Promise<void> {
    if (!value || typeof value !== 'object') throw new Error('Invalid artifact write.');
    const request = value as Partial<DesktopExportWriteRequest>;
    const session = requireExportSession(request.sessionId);
    if (!(request.bytes instanceof Uint8Array)) throw new Error('Invalid artifact bytes.');
    if (typeof request.filename !== 'string' || !/^[a-z0-9_.-]+\.(wav|json)$/i.test(request.filename)) {
        throw new Error('Invalid artifact filename.');
    }
    if (!session.artifactsTemporaryPath) {
        const base = basename(session.targetPath, extname(session.targetPath));
        session.artifactsTemporaryPath = join(dirname(session.targetPath), `.mvmnt-export-${session.id}-assets`);
        session.artifactsTargetPath = join(dirname(session.targetPath), `${base}_assets`);
        await mkdir(session.artifactsTemporaryPath);
        await persistExportSessions();
    }
    await writeFile(join(session.artifactsTemporaryPath, request.filename), request.bytes, { flag: 'wx' });
    session.bytesWritten += request.bytes.byteLength;
}

async function abortExport(sessionId: unknown): Promise<void> {
    const session = requireExportSession(sessionId);
    exportSessions.delete(session.id);
    await persistExportSessions();
    await session.handle?.close().catch(() => undefined);
    await rm(session.temporaryPath, { force: true, recursive: session.kind === 'image-sequence' }).catch(
        () => undefined
    );
    if (session.artifactsTemporaryPath) {
        await rm(session.artifactsTemporaryPath, { force: true, recursive: true }).catch(() => undefined);
    }
}

async function abortAllExports(): Promise<void> {
    await Promise.all([...exportSessions.keys()].map((id) => abortExport(id).catch(() => undefined)));
}

async function completeExport(value: unknown): Promise<DesktopExportCompleteResult> {
    try {
        if (!value || typeof value !== 'object') throw new Error('Invalid export completion.');
        const request = value as Partial<DesktopExportCompleteRequest>;
        const session = requireExportSession(request.sessionId);
        if (session.kind === 'image-sequence') {
            const files = await readdir(session.temporaryPath);
            const frameFiles = files.filter((name) => /^frame_\d{5,9}\.png$/.test(name));
            const expectedFrames =
                typeof request.expectedFrames === 'number'
                    ? request.expectedFrames
                    : typeof request.manifest?.frameCount === 'number'
                      ? request.manifest.frameCount
                      : undefined;
            if (frameFiles.length === 0 || (expectedFrames !== undefined && frameFiles.length !== expectedFrames)) {
                throw new Error(
                    `Image sequence verification failed: expected ${expectedFrames ?? 'at least one'} frame(s), found ${frameFiles.length}.`
                );
            }
            if (request.manifest) {
                await writeFile(
                    join(session.temporaryPath, 'manifest.json'),
                    JSON.stringify(request.manifest, null, 2),
                    { flag: 'wx' }
                );
            }
        } else {
            await session.handle?.sync();
            const header = new Uint8Array(12);
            await session.handle?.read(header, 0, header.byteLength, 0);
            await session.handle?.close();
            const temporaryStats = await stat(session.temporaryPath);
            if (!temporaryStats.isFile() || temporaryStats.size === 0)
                throw new Error('Export verification failed: output is empty.');
            const extension = extname(session.targetPath).toLowerCase();
            const validHeader =
                extension === '.mp4'
                    ? new TextDecoder().decode(header.slice(4, 8)) === 'ftyp'
                    : extension === '.webm'
                      ? header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
                      : extension === '.wav'
                        ? new TextDecoder().decode(header.slice(0, 4)) === 'RIFF'
                        : true;
            if (!validHeader) throw new Error(`Export verification failed: invalid ${extension || 'media'} header.`);
        }
        await swapIntoPlace(session.temporaryPath, session.targetPath);
        if (session.artifactsTemporaryPath && session.artifactsTargetPath) {
            try {
                await swapIntoPlace(session.artifactsTemporaryPath, session.artifactsTargetPath);
            } catch (error) {
                console.warn('Could not finalize export artifacts:', error);
            }
        }
        if (session.kind !== 'image-sequence' && request.manifest) {
            const checksum = await hashExportFile(session.targetPath).catch((error) => {
                console.warn('Could not checksum export:', error);
                return null;
            });
            const manifest = checksum
                ? { ...request.manifest, outputSha256: checksum.sha256, outputBytes: checksum.bytes }
                : request.manifest;
            const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
            await atomicWrite(`${session.targetPath}.manifest.json`, manifestBytes).catch((error) => {
                console.warn('Could not write export manifest:', error);
            });
        }
        const outputId = randomToken();
        completedExports.set(outputId, session.targetPath);
        exportSessions.delete(session.id);
        await persistExportSessions();
        return {
            status: 'completed',
            outputId,
            displayName: session.displayName,
            bytesWritten: session.bytesWritten,
        };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

async function hashExportFile(filePath: string): Promise<{ sha256: string; bytes: number }> {
    const child = utilityProcess.fork(join(sourceDirectory, 'export-worker.js'), [], {
        serviceName: 'MVMNT Export Verifier',
    });
    const id = randomToken();
    return new Promise((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => {
            child.kill();
            rejectPromise(new Error('Export checksum timed out.'));
        }, 120_000);
        child.on('message', (message: any) => {
            if (message?.id !== id) return;
            clearTimeout(timeout);
            child.kill();
            if (message.ok && typeof message.sha256 === 'string' && typeof message.bytes === 'number') {
                resolvePromise({ sha256: message.sha256, bytes: message.bytes });
            } else {
                rejectPromise(
                    new Error(typeof message?.error === 'string' ? message.error : 'Export checksum failed.')
                );
            }
        });
        child.once('exit', (code) => {
            if (code !== 0) {
                clearTimeout(timeout);
                rejectPromise(new Error(`Export verifier exited with code ${code}.`));
            }
        });
        child.postMessage({ id, type: 'sha256', path: filePath });
    });
}

function updateWindowTitle(): void {
    if (!mainWindow) return;
    const documentName = activeDocumentPath ? basename(activeDocumentPath, PROJECT_EXTENSION) : 'Untitled';
    mainWindow.setTitle(`${documentDirty ? '● ' : ''}${documentName} — MVMNT`);
    mainWindow.setDocumentEdited(process.platform === 'darwin' && documentDirty);
    if (process.platform === 'darwin') mainWindow.setRepresentedFilename(activeDocumentPath ?? '');
}

function sendMenuCommand(command: DesktopMenuCommand): void {
    mainWindow?.webContents.send('menu:command', command);
}

function buildApplicationMenu(): Menu {
    const isMac = process.platform === 'darwin';
    const fileMenu: MenuItemConstructorOptions = {
        label: 'File',
        submenu: [
            { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new') },
            { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open') },
            {
                role: 'recentDocuments',
                submenu: [{ role: 'clearRecentDocuments' }],
            },
            { type: 'separator' },
            { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
            { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuCommand('save-as') },
            { type: 'separator' },
            { label: 'Recovery Versions…', click: () => sendMenuCommand('recovery') },
            { label: 'Storage & Caches…', click: () => sendMenuCommand('storage') },
            { type: 'separator' },
            isMac ? { role: 'close' } : { role: 'quit' },
        ],
    };
    const template: MenuItemConstructorOptions[] = [
        ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
        fileMenu,
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                {
                    label: 'MVMNT on GitHub',
                    click: () => void shell.openExternal('https://github.com/Maokus/MVMNT'),
                },
            ],
        },
    ];
    return Menu.buildFromTemplate(template);
}

function contentType(filePath: string): string {
    const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.mvt': 'application/zip',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    };
    return types[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data: blob: https://fonts.gstatic.com",
    `connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://www.googleapis.com https://fonts.gstatic.com${postHogCspConnectSrc ? ` ${postHogCspConnectSrc}` : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
].join('; ');

async function handleAppProtocol(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const filePath = resolveRendererPath(rendererRoot, url.pathname);
    if (!filePath) return new Response('Forbidden', { status: 403 });

    try {
        const bytes = await readFile(filePath);
        return new Response(bytes, {
            headers: {
                'Content-Type': contentType(filePath),
                'Content-Security-Policy': contentSecurityPolicy,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
            },
        });
    } catch {
        return new Response('Not found', { status: 404 });
    }
}

async function readOpenPath(filePath: string): Promise<DesktopOpenResult> {
    if (!isSupportedOpenPath(filePath)) return { canceled: true };
    const bytes = new Uint8Array(await readFile(filePath));
    const kind = openKindForPath(filePath);
    if (kind === 'project') pendingOpenPath = filePath;
    return { canceled: false, kind, displayName: basename(filePath), bytes };
}

async function chooseOpenPath(): Promise<DesktopOpenResult> {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open MVMNT Project',
        properties: ['openFile'],
        filters: [
            { name: 'MVMNT Projects', extensions: ['mvt'] },
            { name: 'MVMNT Plugins', extensions: ['mvmnt-plugin'] },
        ],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return readOpenPath(result.filePaths[0]);
}

function validateBytes(value: unknown): Uint8Array {
    if (!(value instanceof Uint8Array)) throw new Error('Project data must be binary.');
    if (value.byteLength === 0) throw new Error('Project data is empty.');
    return value;
}

async function chooseSaveAs(value: unknown): Promise<DesktopSaveAsSelectionResult> {
    try {
        if (!value || typeof value !== 'object') throw new Error('Invalid Save As request.');
        const request = value as Partial<DesktopSaveAsSelectionRequest>;
        const suggestedName = sanitizeSuggestedName(request.suggestedName);
        if (!mainWindow) return { status: 'canceled' };
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Save MVMNT Project As',
            defaultPath: suggestedName,
            filters: [{ name: 'MVMNT Projects', extensions: ['mvt'] }],
            properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
        if (result.canceled || !result.filePath) return { status: 'canceled' };
        const targetPath = ensureProjectExtension(result.filePath);
        const selectionId = randomUUID();
        pendingSaveAs = { id: selectionId, targetPath };
        return { status: 'selected', selectionId, displayName: basename(targetPath) };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

async function saveDocument(value: unknown): Promise<DesktopSaveResult> {
    try {
        const request = validateSaveRequest(value);
        if (!activeDocumentPath) return { status: 'error', error: 'Choose a destination with Save As first.' };
        await atomicWrite(activeDocumentPath, request.bytes);
        pendingOpenPath = null;
        documentDirty = false;
        app.addRecentDocument(activeDocumentPath);
        rememberRecentDocument(activeDocumentPath);
        await persistDocumentState();
        updateWindowTitle();
        return { status: 'saved', displayName: basename(activeDocumentPath) };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

async function writeSaveAs(value: unknown): Promise<DesktopSaveResult> {
    try {
        if (!value || typeof value !== 'object') throw new Error('Invalid Save As write request.');
        const request = value as Partial<DesktopWriteSaveAsRequest>;
        if (!pendingSaveAs || request.selectionId !== pendingSaveAs.id) {
            throw new Error('The Save As destination is no longer available. Choose a destination again.');
        }
        const targetPath = pendingSaveAs.targetPath;
        pendingSaveAs = null;
        await atomicWrite(targetPath, validateBytes(request.bytes));
        activeDocumentPath = targetPath;
        pendingOpenPath = null;
        documentDirty = false;
        app.addRecentDocument(targetPath);
        rememberRecentDocument(targetPath);
        await persistDocumentState();
        updateWindowTitle();
        return { status: 'saved', displayName: basename(targetPath) };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

function documentState() {
    return activeDocumentPath
        ? { status: 'saved' as const, displayName: basename(activeDocumentPath) }
        : { status: 'untitled' as const };
}

async function restoreActiveDocument(): Promise<DesktopOpenResult> {
    if (!activeDocumentPath) return { canceled: true };
    try {
        const bytes = new Uint8Array(await readFile(activeDocumentPath));
        return { canceled: false, kind: 'project', displayName: basename(activeDocumentPath), bytes };
    } catch {
        // Do not leave a stale path available as a future overwrite target.
        activeDocumentPath = null;
        await persistDocumentState();
        updateWindowTitle();
        return { canceled: true };
    }
}

async function renameDocument(value: unknown): Promise<DesktopRenameResult> {
    try {
        if (!activeDocumentPath) return { status: 'error', error: 'This project has not been saved yet.' };
        if (!value || typeof value !== 'object') throw new Error('Invalid rename request.');
        const request = value as Partial<DesktopRenameRequest>;
        const filename = sanitizeSuggestedName(request.filename);
        const targetPath = join(dirname(activeDocumentPath), filename);
        if (targetPath === activeDocumentPath) return { status: 'renamed', displayName: basename(targetPath) };

        try {
            await access(targetPath);
            const choice = await dialog.showMessageBox(mainWindow!, {
                type: 'warning',
                message: `A project named ${filename} already exists in this folder.`,
                detail: 'Replace it with this project?',
                buttons: ['Cancel', 'Replace'],
                defaultId: 0,
                cancelId: 0,
            });
            if (choice.response !== 1) return { status: 'canceled' };
            await rm(targetPath, { force: true });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code !== 'ENOENT') throw error;
        }

        await rename(activeDocumentPath, targetPath);
        activeDocumentPath = targetPath;
        await persistDocumentState();
        updateWindowTitle();
        return { status: 'renamed', displayName: basename(targetPath) };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

async function fetchLatestRelease(): Promise<UpdateCheckResult> {
    if (!buildInfo.updateChecksEnabled) return { status: 'disabled' };

    try {
        const response = await net.fetch(GITHUB_LATEST_RELEASE_API, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': `MVMNT/${buildInfo.version}`,
                'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`GitHub release check returned HTTP ${response.status}.`);
        const release = (await response.json()) as { tag_name?: unknown; draft?: unknown; prerelease?: unknown };
        return resolveUpdateAvailability(buildInfo.version, release, RELEASES_LATEST_URL);
    } catch (error) {
        console.warn('Could not check GitHub for MVMNT updates:', error);
        return { status: 'error' };
    }
}

function checkForUpdates(): Promise<UpdateCheckResult> {
    updateCheck ??= fetchLatestRelease();
    return updateCheck;
}

function installIpcHandlers(): void {
    ipcMain.handle('documents:open', chooseOpenPath);
    ipcMain.handle('documents:list-recent', listRecentDocuments);
    ipcMain.handle('documents:open-recent', (_event, index) => openRecentDocument(index));
    ipcMain.handle('documents:save', (_event, request) => saveDocument(request));
    ipcMain.handle('documents:choose-save-as', (_event, request) => chooseSaveAs(request));
    ipcMain.handle('documents:write-save-as', (_event, request) => writeSaveAs(request));
    ipcMain.handle('documents:get-state', () => documentState());
    ipcMain.handle('documents:restore-active', () => restoreActiveDocument());
    ipcMain.handle('documents:rename', (_event, request) => renameDocument(request));
    ipcMain.handle('documents:accept-open', async () => {
        if (!pendingOpenPath) return;
        activeDocumentPath = pendingOpenPath;
        pendingOpenPath = null;
        documentDirty = false;
        app.addRecentDocument(activeDocumentPath);
        rememberRecentDocument(activeDocumentPath);
        await persistDocumentState();
        updateWindowTitle();
    });
    ipcMain.handle('documents:clear-active-path', async () => {
        activeDocumentPath = null;
        pendingOpenPath = null;
        pendingSaveAs = null;
        await persistDocumentState();
        updateWindowTitle();
    });
    ipcMain.on('documents:set-dirty', (_event, value) => {
        documentDirty = value === true;
        updateWindowTitle();
    });
    ipcMain.handle('app:get-version', () => buildInfo.version);
    ipcMain.handle('app:get-build-info', () => buildInfo);
    ipcMain.handle('app:check-for-updates', checkForUpdates);
    ipcMain.on('app:notify', (_event, title, body) => {
        if (typeof title !== 'string' || typeof body !== 'string') return;
        if (!Notification.isSupported()) return;
        new Notification({ title: title.slice(0, 100), body: body.slice(0, 500) }).show();
    });
    ipcMain.handle('exports:begin', (_event, request) => beginExport(request));
    ipcMain.handle('exports:choose-destination', (_event, request) => chooseExportDestination(request));
    ipcMain.handle('exports:write', (_event, request) => writeExport(request));
    ipcMain.handle('exports:write-frame', (_event, request) => writeExportFrame(request));
    ipcMain.handle('exports:write-artifact', (_event, request) => writeExportArtifact(request));
    ipcMain.handle('exports:complete', (_event, request) => completeExport(request));
    ipcMain.handle('exports:abort', (_event, sessionId) => abortExport(sessionId));
    ipcMain.handle('exports:reveal', (_event, outputId) => {
        if (typeof outputId !== 'string') return false;
        const outputPath = completedExports.get(outputId);
        if (!outputPath) return false;
        shell.showItemInFolder(outputPath);
        return true;
    });
    ipcMain.handle('background:start', async (_event, request: DesktopBackgroundExportRequest) => {
        if (
            !request ||
            typeof request.jobId !== 'string' ||
            !request.jobId ||
            (request.kind !== 'video' && request.kind !== 'png') ||
            !(request.bytes instanceof Uint8Array) ||
            backgroundExportHosts.has(request.jobId)
        ) {
            return { accepted: false, error: 'Invalid or duplicate background export request.' };
        }
        try {
            const host = new BrowserWindow({
                show: false,
                width: 64,
                height: 64,
                webPreferences: {
                    preload: join(sourceDirectory, 'preload.cjs'),
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true,
                    webSecurity: true,
                    backgroundThrottling: false,
                },
            });
            backgroundExportHosts.set(request.jobId, { request, window: host });
            host.on('closed', () => {
                const active = backgroundExportHosts.get(request.jobId);
                if (active?.window === host) {
                    backgroundExportHosts.delete(request.jobId);
                    mainWindow?.webContents.send('background:update', {
                        jobId: request.jobId,
                        patch: {
                            status: 'failed',
                            text: 'Background export host closed unexpectedly',
                            finishedAt: new Date().toISOString(),
                        },
                    } satisfies DesktopBackgroundExportUpdate);
                }
            });
            const url = isDevelopment ? process.env.MVMNT_RENDERER_URL! : `${APP_ORIGIN}/`;
            await host.loadURL(url);
            return { accepted: true };
        } catch (error) {
            return { accepted: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    ipcMain.handle('background:take', (event) => {
        for (const host of backgroundExportHosts.values()) {
            if (host.window.webContents.id === event.sender.id) return host.request;
        }
        return null;
    });
    ipcMain.handle('background:cancel', (_event, jobId: unknown) => {
        if (typeof jobId !== 'string') return false;
        const host = backgroundExportHosts.get(jobId);
        if (!host || host.window.isDestroyed()) return false;
        host.window.webContents.send('background:cancel', jobId);
        return true;
    });
    ipcMain.on('background:update', (event, update: DesktopBackgroundExportUpdate) => {
        const host = backgroundExportHosts.get(update?.jobId);
        if (
            !host ||
            host.window.webContents.id !== event.sender.id ||
            !update.patch ||
            typeof update.patch !== 'object'
        )
            return;
        mainWindow?.webContents.send('background:update', update);
    });
    ipcMain.on('background:complete', (event, update: DesktopBackgroundExportUpdate) => {
        const host = backgroundExportHosts.get(update?.jobId);
        if (
            !host ||
            host.window.webContents.id !== event.sender.id ||
            !update.patch ||
            typeof update.patch !== 'object'
        )
            return;
        mainWindow?.webContents.send('background:update', update);
        backgroundExportHosts.delete(update.jobId);
        host.window.destroy();
    });
    ipcMain.handle('external:open-https', async (_event, value) => {
        if (typeof value !== 'string') return false;
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
            await shell.openExternal(url.toString());
            return true;
        } catch {
            return false;
        }
    });
    ipcMain.handle('dropped-files:read', (_event, paths) => readDroppedFiles(paths));
    ipcMain.handle('storage:inspect', inspectStorage);
    ipcMain.handle('storage:cleanup', (_event, category) => cleanupStorage(category));
    ipcMain.on('automation:progress', (_event, progress: DesktopAutomationProgress) => {
        if (!renderCommand || progress?.type !== 'progress') return;
        automationOutput({
            type: 'progress',
            progress: Math.max(0, Math.min(100, Number(progress.progress) || 0)),
            message: String(progress.message || ''),
        });
    });
    ipcMain.on('automation:ready', () => void deliverRenderRequest());
    ipcMain.on('automation:result', (_event, result: DesktopAutomationResult) => {
        if (!renderCommand || (result?.type !== 'complete' && result?.type !== 'error')) return;
        finishAutomation(result);
    });
    ipcMain.on('lifecycle:close-complete', (_event, result: CloseRequestResult) => {
        closeRequestPending = false;
        if (result !== 'saved' && result !== 'discarded') return;
        allowClose = true;
        mainWindow?.close();
    });
}

async function deliverOpenPath(filePath: string): Promise<void> {
    if (!rendererReady || !mainWindow) {
        queuedOpenPaths.push(filePath);
        return;
    }
    try {
        const result = await readOpenPath(filePath);
        if (!result.canceled) mainWindow.webContents.send('documents:open-path-request', result);
    } catch (error) {
        await dialog.showMessageBox(mainWindow, {
            type: 'error',
            message: 'Could not open the selected file.',
            detail: error instanceof Error ? error.message : String(error),
        });
    }
}

async function requestClose(): Promise<void> {
    if (!mainWindow || closeRequestPending) return;
    if (exportSessions.size > 0 || backgroundExportHosts.size > 0) {
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Export in progress',
            message: 'MVMNT is still writing an export.',
            detail: 'Keep MVMNT open to finish, or cancel all exports and quit. Partial temporary files will be removed.',
            buttons: ['Keep Running', 'Cancel Exports and Quit'],
            defaultId: 0,
            cancelId: 0,
        });
        if (response === 0) return;
        for (const [jobId, host] of backgroundExportHosts) {
            host.window.webContents.send('background:cancel', jobId);
            host.window.destroy();
        }
        backgroundExportHosts.clear();
        await abortAllExports();
    }
    if (!documentDirty) {
        allowClose = true;
        mainWindow.close();
        return;
    }
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Save changes?',
        message: 'Do you want to save your changes before closing?',
        detail: 'Unsaved changes will be lost if you do not save them.',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
    });
    if (response === 1) {
        allowClose = true;
        mainWindow.close();
    } else if (response === 0) {
        closeRequestPending = true;
        mainWindow.webContents.send('lifecycle:close-request');
    }
}

async function createWindow(): Promise<void> {
    allowClose = false;
    closeRequestPending = false;
    rendererReady = false;
    documentDirty = false;
    mainWindow = new BrowserWindow({
        width: 1500,
        height: 960,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#0a0a0a',
        show: false,
        title: 'Untitled — MVMNT',
        webPreferences: {
            preload: join(sourceDirectory, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
        },
    });
    updateWindowTitle();

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const target = new URL(url);
            if (target.protocol === 'https:' || target.protocol === 'http:') void shell.openExternal(target.toString());
        } catch {}
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowedPrefix = isDevelopment ? process.env.MVMNT_RENDERER_URL! : APP_ORIGIN;
        if (!url.startsWith(allowedPrefix)) event.preventDefault();
    });
    mainWindow.on('close', (event) => {
        if (allowClose || (!documentDirty && exportSessions.size === 0)) return;
        event.preventDefault();
        void requestClose();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    mainWindow.once('ready-to-show', () => {
        if (!renderCommand) mainWindow?.show();
    });
    mainWindow.webContents.once('did-finish-load', async () => {
        rendererReady = true;
        for (const path of queuedOpenPaths.splice(0)) void deliverOpenPath(path);
        if (pendingDeepLink) {
            mainWindow?.webContents.send('automation:deep-link', pendingDeepLink);
            pendingDeepLink = null;
        }
        if (process.env.MVMNT_SMOKE_TEST === '1') {
            const smokePath = join(app.getPath('temp'), `.mvmnt-export-smoke-${process.pid}.bin`);
            let hasVerifier = false;
            try {
                await writeFile(smokePath, 'abc');
                const checksum = await hashExportFile(smokePath);
                hasVerifier = checksum.sha256 === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
            } catch (error) {
                console.error('[electron-smoke] export verifier failed', error);
            } finally {
                await rm(smokePath, { force: true }).catch(() => undefined);
            }
            void mainWindow?.webContents
                .executeJavaScript(
                    `({
                protocol: location.protocol,
                hasRoot: Boolean(document.querySelector('#root')?.firstElementChild),
                hasBridge: typeof window.mvmntDesktop?.app?.getVersion === 'function'
            })`
                )
                .then((result: { protocol?: string; hasRoot?: boolean; hasBridge?: boolean }) => {
                    const passed =
                        result.protocol === `${APP_SCHEME}:` &&
                        result.hasRoot === true &&
                        result.hasBridge === true &&
                        hasVerifier;
                    console.log(`[electron-smoke] ${passed ? 'passed' : 'failed'}`, { ...result, hasVerifier });
                    app.exit(passed ? 0 : 1);
                })
                .catch((error) => {
                    console.error('[electron-smoke] failed', error);
                    app.exit(1);
                });
        }
    });

    if (isDevelopment) {
        await mainWindow.loadURL(process.env.MVMNT_RENDERER_URL!);
    } else {
        await mainWindow.loadURL(`${APP_ORIGIN}/`);
    }
}

function configureSession(): void {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const trusted = webContents === mainWindow?.webContents;
        callback(trusted && (permission === 'clipboard-sanitized-write' || permission === 'fullscreen'));
    });
    session.defaultSession.on('will-download', (_event, item) => {
        item.setSaveDialogOptions({
            title: 'Save Export',
            defaultPath: item.getFilename(),
            properties: ['createDirectory', 'showOverwriteConfirmation'],
        });
    });
}

removeWindowsFileAssociationsOnUninstall();
if (started) app.quit();

const hasSingleInstanceLock = renderCommand ? true : app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, argv) => {
        const filePath = argv.find(isSupportedOpenPath);
        if (filePath) void deliverOpenPath(filePath);
        const deepLink = argv.map(parseDeepLink).find((value): value is DesktopDeepLinkCommand => Boolean(value));
        if (deepLink) mainWindow?.webContents.send('automation:deep-link', deepLink);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        void deliverOpenPath(filePath);
    });
    app.on('open-url', (event, url) => {
        event.preventDefault();
        const command = parseDeepLink(url);
        if (!command) return;
        if (rendererReady) mainWindow?.webContents.send('automation:deep-link', command);
        else pendingDeepLink = command;
    });
    app.whenReady().then(async () => {
        if (renderArgumentError) {
            automationOutput({ type: 'error', code: 'usage', message: renderArgumentError });
            app.exit(2);
            return;
        }
        protocol.handle(APP_SCHEME, handleAppProtocol);
        installIpcHandlers();
        configureSession();
        await cleanupInterruptedExports();
        await restoreDocumentState();
        await restoreRecentDocuments();
        if (app.isPackaged && buildInfo.channel === 'stable') {
            app.setAsDefaultProtocolClient(APP_SCHEME);
            await updateWindowsFileAssociations(false).catch((error) => {
                console.warn('Could not register Windows file associations:', error);
            });
        }
        Menu.setApplicationMenu(buildApplicationMenu());
        await createWindow();
        const startupPath = process.argv.find(isSupportedOpenPath);
        if (startupPath) void deliverOpenPath(startupPath);
        const startupLink = process.argv
            .map(parseDeepLink)
            .find((value): value is DesktopDeepLinkCommand => Boolean(value));
        if (startupLink && !renderCommand) {
            if (rendererReady) mainWindow?.webContents.send('automation:deep-link', startupLink);
            else pendingDeepLink = startupLink;
        }
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
    app.on('window-all-closed', () => {
        if (renderCommand || process.platform !== 'darwin') app.quit();
    });
}

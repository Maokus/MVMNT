import { readFile, rename, writeFile } from 'node:fs/promises';
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
    protocol,
    session,
    shell,
    type MenuItemConstructorOptions,
} from 'electron';
import started from 'electron-squirrel-startup';
import { UpdateSourceType, updateElectronApp } from 'update-electron-app';
import type {
    CloseRequestResult,
    DesktopMenuCommand,
    DesktopOpenKind,
    DesktopOpenResult,
    DesktopSaveRequest,
    DesktopSaveResult,
} from './shared/desktop-api.js';
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
let documentDirty = false;
let allowClose = false;
let closeRequestPending = false;
let rendererReady = false;
const queuedOpenPaths: string[] = [];

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(sourceDirectory, '..');
const rendererRoot = join(appRoot, 'build');
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
        `.${basename(filePath)}.${process.pid}.${Date.now().toString(36)}.tmp`,
    );
    try {
        await writeFile(temporaryPath, bytes);
        await rename(temporaryPath, filePath);
    } catch (error) {
        try {
            const { rm } = await import('node:fs/promises');
            await rm(temporaryPath, { force: true });
        } catch {}
        throw error;
    }
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
    "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://www.googleapis.com https://fonts.googleapis.com https://fonts.gstatic.com",
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

async function chooseSavePath(suggestedName: string): Promise<string | null> {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save MVMNT Project',
        defaultPath: suggestedName,
        filters: [{ name: 'MVMNT Projects', extensions: ['mvt'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    return result.canceled || !result.filePath ? null : ensureProjectExtension(result.filePath);
}

async function saveDocument(value: unknown, forceSaveAs: boolean): Promise<DesktopSaveResult> {
    try {
        const request = validateSaveRequest(value);
        const targetPath = forceSaveAs || !activeDocumentPath
            ? await chooseSavePath(request.suggestedName)
            : activeDocumentPath;
        if (!targetPath) return { status: 'canceled' };
        await atomicWrite(targetPath, request.bytes);
        activeDocumentPath = targetPath;
        pendingOpenPath = null;
        documentDirty = false;
        app.addRecentDocument(targetPath);
        await persistDocumentState();
        updateWindowTitle();
        return { status: 'saved', displayName: basename(targetPath) };
    } catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
}

function installIpcHandlers(): void {
    ipcMain.handle('documents:open', chooseOpenPath);
    ipcMain.handle('documents:save', (_event, request) => saveDocument(request, false));
    ipcMain.handle('documents:save-as', (_event, request) => saveDocument(request, true));
    ipcMain.handle('documents:accept-open', async () => {
        if (!pendingOpenPath) return;
        activeDocumentPath = pendingOpenPath;
        pendingOpenPath = null;
        documentDirty = false;
        app.addRecentDocument(activeDocumentPath);
        await persistDocumentState();
        updateWindowTitle();
    });
    ipcMain.handle('documents:clear-active-path', async () => {
        activeDocumentPath = null;
        pendingOpenPath = null;
        await persistDocumentState();
        updateWindowTitle();
    });
    ipcMain.on('documents:set-dirty', (_event, value) => {
        documentDirty = value === true;
        updateWindowTitle();
    });
    ipcMain.handle('app:get-version', () => app.getVersion());
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
        if (allowClose || !documentDirty) return;
        event.preventDefault();
        void requestClose();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.webContents.once('did-finish-load', () => {
        rendererReady = true;
        for (const path of queuedOpenPaths.splice(0)) void deliverOpenPath(path);
        if (process.env.MVMNT_SMOKE_TEST === '1') {
            void mainWindow?.webContents.executeJavaScript(`({
                protocol: location.protocol,
                hasRoot: Boolean(document.querySelector('#root')?.firstElementChild),
                hasBridge: typeof window.mvmntDesktop?.app?.getVersion === 'function'
            })`).then((result: { protocol?: string; hasRoot?: boolean; hasBridge?: boolean }) => {
                const passed = result.protocol === `${APP_SCHEME}:` && result.hasRoot === true && result.hasBridge === true;
                console.log(`[electron-smoke] ${passed ? 'passed' : 'failed'}`, result);
                app.exit(passed ? 0 : 1);
            }).catch((error) => {
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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, argv) => {
        const filePath = argv.find(isSupportedOpenPath);
        if (filePath) void deliverOpenPath(filePath);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        void deliverOpenPath(filePath);
    });
    app.whenReady().then(async () => {
        protocol.handle(APP_SCHEME, handleAppProtocol);
        installIpcHandlers();
        configureSession();
        await restoreDocumentState();
        if (app.isPackaged) {
            app.setAsDefaultProtocolClient(APP_SCHEME);
            await updateWindowsFileAssociations(false).catch((error) => {
                console.warn('Could not register Windows file associations:', error);
            });
        }
        Menu.setApplicationMenu(buildApplicationMenu());
        await createWindow();
        const startupPath = process.argv.find(isSupportedOpenPath);
        if (startupPath) void deliverOpenPath(startupPath);
        if (app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32')) {
            updateElectronApp({
                updateSource: { type: UpdateSourceType.ElectronPublicUpdateService, repo: 'Maokus/MVMNT' },
                updateInterval: '10 minutes',
                notifyUser: true,
            });
        }
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}

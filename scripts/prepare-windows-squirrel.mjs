import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorDirectory = path.join(projectRoot, 'node_modules', 'electron-winstaller', 'vendor');

// electron-winstaller selects 7z.exe at install time from the host architecture.
// `make:win` always targets Windows x64, so ensure Squirrel receives an x64 7z even
// when it is invoked from an ARM64 macOS build host.
await Promise.all([
    copyFile(path.join(vendorDirectory, '7z-x64.exe'), path.join(vendorDirectory, '7z.exe')),
    copyFile(path.join(vendorDirectory, '7z-x64.dll'), path.join(vendorDirectory, '7z.dll')),
]);

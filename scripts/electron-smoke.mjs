import { spawn } from 'node:child_process';
import electron from 'electron';

const child = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, MVMNT_SMOKE_TEST: '1' },
});

child.once('error', (error) => {
    console.error('[electron-smoke] could not launch Electron', error);
    process.exit(1);
});

child.once('exit', (code, signal) => {
    if (signal) {
        console.error(`[electron-smoke] Electron exited from signal ${signal}`);
        process.exit(1);
    }
    process.exit(code ?? 1);
});

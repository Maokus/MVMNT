import { spawn } from 'node:child_process';
import electron from 'electron';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawn(npmCommand, ['run', 'build:electron'], { stdio: 'inherit' });
const buildCode = await new Promise((resolve) => build.once('exit', resolve));
if (buildCode !== 0) process.exit(typeof buildCode === 'number' ? buildCode : 1);

const renderer = spawn(npmCommand, ['run', 'dev:renderer', '--', '--host', '127.0.0.1'], {
    stdio: 'inherit',
});

async function waitForRenderer() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
            const response = await fetch('http://127.0.0.1:5173/');
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Vite renderer did not start within 30 seconds.');
}

try {
    await waitForRenderer();
} catch (error) {
    renderer.kill();
    throw error;
}

const desktop = spawn(electron, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, MVMNT_RENDERER_URL: 'http://127.0.0.1:5173' },
});

function shutdown(signal) {
    desktop.kill(signal);
    renderer.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
desktop.once('exit', (code) => {
    renderer.kill();
    process.exit(code ?? 0);
});

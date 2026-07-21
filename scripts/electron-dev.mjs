import { spawn } from 'node:child_process';
import electron from 'electron';

function runNpmScript(script, args = []) {
    if (process.platform === 'win32') {
        // npm.cmd is a batch file. Windows cannot spawn batch files directly; launch it through
        // cmd.exe so this works from Git Bash, PowerShell, and Command Prompt.
        const command = ['npm', 'run', script, ...args].join(' ');
        return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { stdio: 'inherit' });
    }

    return spawn('npm', ['run', script, ...args], { stdio: 'inherit' });
}

const build = runNpmScript('build:electron');
const buildCode = await new Promise((resolve) => build.once('exit', resolve));
if (buildCode !== 0) process.exit(typeof buildCode === 'number' ? buildCode : 1);

const renderer = runNpmScript('dev:renderer', ['--', '--host', '127.0.0.1']);

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

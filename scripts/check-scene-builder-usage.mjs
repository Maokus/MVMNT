#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const targetDir = path.join(repoRoot, 'src');

const mutatingMembers = [
    'addElement',
    'addElementFromRegistry',
    'removeElement',
    'updateElementConfig',
    'moveElement',
    'duplicateElement',
    'clearElements',
    'clearScene',
    'resetSceneSettings',
    'updateElementId',
    'updateSceneSettings',
    'loadScene',
    'setZIndex',
    'setVisible',
];

const allowList = new Set([
    'src/core/scene-builder.ts',
    'src/state/scene/commandGateway.ts',
]);

function isMutatingLine(line) {
    return mutatingMembers.some((member) => line.includes(`sceneBuilder.${member}`) || line.includes(`.sceneBuilder.${member}`));
}

async function* walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(entryPath);
        } else if (entry.isFile()) {
            yield entryPath;
        }
    }
}

async function main() {
    const violations = [];
    for await (const filePath of walk(targetDir)) {
        if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;
        const relative = path.relative(repoRoot, filePath);
        if (allowList.has(relative)) continue;
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
            if (isMutatingLine(line) && !line.includes('scene-builder-allow')) {
                violations.push({ file: relative, line: idx + 1, code: line.trim() });
            }
        });
    }

    if (violations.length > 0) {
        console.error('\nScene builder mutation checks failed. Route mutations through dispatchSceneCommand.');
        for (const violation of violations) {
            console.error(`- ${violation.file}:${violation.line} -> ${violation.code}`);
        }
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Scene builder usage check failed:', err);
    process.exit(1);
});

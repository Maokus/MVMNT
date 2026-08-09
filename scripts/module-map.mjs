import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const roots = ['src', 'packages', 'electron', 'scripts'];
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const aliases = new Map([
    ['@app', 'src/app'],
    ['@audio', 'src/audio'],
    ['@core', 'src/core'],
    ['@automation', 'src/automation'],
    ['@bindings', 'src/bindings'],
    ['@export', 'src/export'],
    ['@math', 'src/math'],
    ['@persistence', 'src/persistence'],
    ['@devtools', 'src/devtools'],
    ['@workspace', 'src/workspace'],
    ['@config', 'src/config'],
    ['@state', 'src/state'],
    ['@selectors', 'src/state/selectors'],
    ['@context', 'src/context'],
    ['@fonts', 'src/fonts'],
    ['@utils', 'src/utils'],
    ['@hooks', 'src/hooks'],
    ['@pages', 'src/pages'],
    ['@assets', 'src/assets'],
    ['@mvmnt-app/plugin-sdk', 'packages/plugin-sdk/src'],
]);

function walk(path) {
    if (!statSync(path).isDirectory()) return [path];
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.name === 'node_modules' || entry.name === 'dist' ? [] : walk(join(path, entry.name))
    );
}

const files = roots.flatMap((dir) => walk(resolve(root, dir))).filter((file) => extensions.includes(extname(file)));
const relativeFiles = new Set(files.map((file) => relative(root, file).replaceAll('\\', '/')));

function resolveImport(importer, specifier) {
    let candidate;
    if (specifier.startsWith('.')) candidate = join(dirname(importer), specifier);
    else {
        const alias = [...aliases].find(([key]) => specifier === key || specifier.startsWith(`${key}/`));
        if (!alias) return null;
        candidate = join(alias[1], specifier.slice(alias[0].length));
    }
    candidate = candidate.replaceAll('\\', '/').replace(/^\.\//, '');
    for (const suffix of ['', ...extensions, ...extensions.map((extension) => `/index${extension}`)]) {
        const match = `${candidate}${suffix}`;
        if (relativeFiles.has(match)) return match;
    }
    return null;
}

const graph = {};
const importPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
for (const file of [...relativeFiles].sort()) {
    const source = readFileSync(resolve(root, file), 'utf8');
    graph[file] = [...source.matchAll(importPattern)]
        .map((match) => resolveImport(file, match[1] ?? match[2]))
        .filter(Boolean)
        .sort();
}

const cycles = [];
const visiting = new Set();
const visited = new Set();
const stack = [];
function visit(node) {
    if (visiting.has(node)) {
        const start = stack.indexOf(node);
        cycles.push([...stack.slice(start), node]);
        return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const dependency of graph[node] ?? []) visit(dependency);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
}
for (const file of Object.keys(graph)) visit(file);

const report = { generatedAt: new Date().toISOString(), modules: graph, cycles };
const output = resolve(root, '.cache/module-map.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Module map: ${Object.keys(graph).length} modules, ${cycles.length} cycle(s); ${relative(root, output)}`);
for (const cycle of cycles) console.log(`  ${cycle.join(' -> ')}`);
if (process.argv.includes('--check') && cycles.length > 0) process.exitCode = 1;

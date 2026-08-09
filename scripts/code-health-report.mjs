import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const sourceRoot = resolve(root, 'src');
const extensions = new Set(['.ts', '.tsx']);

function walk(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
        const child = join(path, entry.name);
        return entry.isDirectory() ? walk(child) : extensions.has(extname(entry.name)) ? [child] : [];
    });
}

const files = walk(sourceRoot);
const domains = {};
const moduleSizes = [];
for (const file of files) {
    const path = relative(root, file).replaceAll('\\', '/');
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/).length;
    const domain = path.split('/').slice(0, 3).join('/');
    const entry = (domains[domain] ??= { explicitAny: 0, suppressions: 0, files: 0 });
    entry.files += 1;
    entry.explicitAny += (source.match(/\b(?:as|:)\s+any\b/g) ?? []).length;
    entry.suppressions += (source.match(/@ts-(?:ignore|expect-error|nocheck)|eslint-disable/g) ?? []).length;
    moduleSizes.push({ path, lines, bytes: statSync(file).size });
}

moduleSizes.sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));
const report = {
    generatedAt: new Date().toISOString(),
    typeDebtByDomain: Object.fromEntries(Object.entries(domains).sort(([left], [right]) => left.localeCompare(right))),
    largestModules: moduleSizes.slice(0, 30),
};
const output = resolve(root, '.cache/code-health.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Code health: ${files.length} modules; ${relative(root, output)}`);
for (const item of report.largestModules.slice(0, 10))
    console.log(`  ${item.lines.toString().padStart(5)}  ${item.path}`);

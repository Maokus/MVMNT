import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function collectMarkdownFiles(directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectMarkdownFiles(path);
        return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    });
}

const markdownFiles = [
    resolve(repositoryRoot, 'README.md'),
    ...collectMarkdownFiles(resolve(repositoryRoot, 'docs')),
    ...collectMarkdownFiles(resolve(repositoryRoot, 'packages')),
];

function githubSlug(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/[`*_~]/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-');
}

function anchorsFor(path) {
    const counts = new Map();
    const anchors = new Set();
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (!match) continue;
        const base = githubSlug(match[2]);
        const count = counts.get(base) ?? 0;
        counts.set(base, count + 1);
        anchors.add(count === 0 ? base : `${base}-${count}`);
    }
    return anchors;
}

function hasExactPathCase(path) {
    const absolute = resolve(path);
    const root = resolve(repositoryRoot);
    if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return true;
    let current = root;
    const segments = relative(root, absolute).split(sep).filter(Boolean);
    for (const segment of segments) {
        if (!existsSync(current) || !statSync(current).isDirectory()) return false;
        if (!readdirSync(current).includes(segment)) return false;
        current = join(current, segment);
    }
    return true;
}

const anchorCache = new Map();
const failures = [];

for (const sourcePath of markdownFiles) {
    const source = readFileSync(sourcePath, 'utf8');
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const patterns = [/!?\[[^\]]*\]\(([^)]+)\)/g, /<a\s+[^>]*href=["']([^"']+)["']/gi];
        for (const pattern of patterns) {
            for (const match of lines[index].matchAll(pattern)) {
                let destination = match[1].trim().replace(/^<|>$/g, '');
                if (!destination || /^(?:https?:|mailto:|tel:|data:)/i.test(destination)) continue;
                destination = destination.split(/\s+["']/)[0];
                const [rawPath, rawAnchor] = destination.split('#', 2);
                const decodedPath = decodeURIComponent(rawPath.split('?')[0]);
                const targetPath = decodedPath ? normalize(resolve(dirname(sourcePath), decodedPath)) : sourcePath;
                const label = `${relative(repositoryRoot, sourcePath)}:${index + 1}`;

                if (!existsSync(targetPath)) {
                    failures.push(`${label}: missing target '${destination}'`);
                    continue;
                }
                if (!hasExactPathCase(targetPath)) {
                    failures.push(`${label}: target path has incorrect casing '${destination}'`);
                    continue;
                }
                if (rawAnchor && extname(targetPath).toLowerCase() === '.md') {
                    let anchors = anchorCache.get(targetPath);
                    if (!anchors) {
                        anchors = anchorsFor(targetPath);
                        anchorCache.set(targetPath, anchors);
                    }
                    const anchor = decodeURIComponent(rawAnchor).toLowerCase();
                    if (!anchors.has(anchor))
                        failures.push(`${label}: missing anchor '#${rawAnchor}' in '${decodedPath}'`);
                }
            }
        }
    }
}

if (failures.length) {
    console.error(`Documentation link check failed with ${failures.length} error(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`Documentation link check passed for ${markdownFiles.length} Markdown files.`);
}

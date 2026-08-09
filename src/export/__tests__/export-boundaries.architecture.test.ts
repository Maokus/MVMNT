import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(target);
        return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
    });
}

describe('export architecture boundaries', () => {
    it('keeps the export domain independent from context and workspace UI', () => {
        const root = path.join(process.cwd(), 'src/export');
        const offenders = sourceFiles(root).filter((file) =>
            /@(?:context|workspace)\//.test(fs.readFileSync(file, 'utf8'))
        );
        expect(offenders).toEqual([]);
    });

    it('does not publish exporter constructors through window globals', () => {
        const root = path.join(process.cwd(), 'src/export');
        const offenders = sourceFiles(root).filter((file) =>
            /window(?:\s+as\s+any)?\)?\.(?:VideoExporter|AVExporter|ImageSequenceGenerator)/.test(
                fs.readFileSync(file, 'utf8')
            )
        );
        expect(offenders).toEqual([]);
    });
});

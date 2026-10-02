const { existsSync, readdirSync, rmSync } = require('node:fs');
const path = require('node:path');

const makeDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../out/make');

rmSync(path.join(makeDir, 'zip', 'darwin'), { recursive: true, force: true });

if (existsSync(makeDir)) {
    for (const entry of readdirSync(makeDir)) {
        if (entry.endsWith('.dmg')) rmSync(path.join(makeDir, entry));
    }
}

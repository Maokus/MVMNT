import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function gitValue(args, fallback) {
    try {
        return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' }).trim() || fallback;
    } catch {
        return fallback;
    }
}

export function readBuildMetadata(environment = process.env) {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const requestedChannel = environment.MVMNT_BUILD_CHANNEL;
    const channel = ['development', 'nightly', 'stable'].includes(requestedChannel) ? requestedChannel : 'development';
    const commit = environment.MVMNT_BUILD_SHA || gitValue(['rev-parse', '--short=8', 'HEAD'], 'unknown');
    const builtAt =
        environment.MVMNT_BUILD_DATE || gitValue(['show', '-s', '--format=%cI', 'HEAD'], new Date(0).toISOString());

    return {
        version: manifest.version,
        channel,
        commit,
        builtAt,
    };
}

export function buildMetadataDefines(environment = process.env) {
    const metadata = readBuildMetadata(environment);
    return {
        __MVMNT_VERSION__: JSON.stringify(metadata.version),
        __MVMNT_BUILD_CHANNEL__: JSON.stringify(metadata.channel),
        __MVMNT_BUILD_SHA__: JSON.stringify(metadata.commit),
        __MVMNT_BUILD_DATE__: JSON.stringify(metadata.builtAt),
    };
}

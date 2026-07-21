const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
const isSupported = major === 22 && minor >= 12;

if (!isSupported) {
    console.error(
        `MVMNT requires Node.js 22.12 through 22.x; found v${process.versions.node}. `
        + 'Install or select Node 22.12+ and reinstall dependencies with npm install.',
    );
    process.exit(1);
}

# Versioning and releases

The root `package.json` is the source of truth for the MVMNT application version. App versions use
[Semantic Versioning](https://semver.org/): patches contain compatible fixes, minor versions add
compatible functionality, and major versions may contain breaking application changes.

Plugin SDK package versions and `.mvt` scene schema versions are independent from the application
version. Change them only when their own contracts change.

## Build channels

- Development builds display `<version>-dev+<short-sha>` and never check for updates.
- Stable builds display the package version exactly, such as `0.16.0`.
- Testing builds display `<version>-nightly.<UTC-date>.<GitHub-run-number>`.

The About page also reports the channel, commit, and build timestamp. Export diagnostics continue to
record the machine-readable native application version.

## Testing builds

Every push to `testing` creates unsigned macOS universal and Windows x64 artifacts. The workflow
derives a unique version such as `0.16.0-nightly.20260812.123`; the artifact name also includes the
short commit SHA.

Nightlies install as **MVMNT Nightly**, with a separate application identity and user-data directory.
They do not register MVMNT protocols or file associations, do not check for updates, and do not
replace a stable installation. Download newer nightlies manually from the relevant GitHub Actions
run.

Before starting nightlies for a new release line, update the root package version to the next intended
stable version and run `npm install` to synchronize the lockfile.

## Stable releases

1. Update `package.json` to the intended version and run `npm install`.
2. Update the changelog and verify the application.
3. Create a tag named exactly `v<package-version>`, for example `v0.16.0`.
4. Push the tag. GitHub Actions verifies, packages, and creates a draft GitHub Release.
5. Test the draft assets, edit the release notes if needed, and publish the release.

The release workflow rejects tags that do not match `package.json`. Stable macOS artifacts are
currently unsigned and must be downloaded and installed manually.

## Update notification

Packaged stable macOS and Windows builds check GitHub's latest published release once per application
session when Home opens. If a newer stable SemVer tag exists, Home links to the GitHub Releases page.
MVMNT never downloads or installs the update automatically. Failures are logged and do not interrupt
startup.

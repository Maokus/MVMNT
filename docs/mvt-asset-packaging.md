# MVT Asset Packaging Notes

## Why exports default to inline JSON
- `exportScene` falls back to `'inline-json'` when callers do not pass a storage mode.
  The export flow stays inlined unless the caller explicitly opts into ZIP packaging.
- The menu bar's `saveScene` action calls `exportScene` without specifying options,
  so user-triggered saves always go through the inline branch today.
- When inline mode is selected, `collectAudioAssets` embeds each audio buffer as
  Base64 in the JSON envelope, and the ZIP assembly path is bypassed.

## Steps toward a more professional `.mvt` format
- **Pick a primary container**: default user exports to `'zip-package'`, retain inline JSON
  only for lightweight debugging, and update the downloader to prefer the `.mvmntpkg`
  extension.
- **Define a manifest**: keep `document.json` as the root descriptor, formalize an
  `assets/` layout (for example, `assets/audio/<id>/original` vs `rendered`), and
  document expected MIME types.
- **Version the schema**: continue using `schemaVersion` in `document.json`, add changelog
  entries whenever asset handling evolves, and gate imports with descriptive
  compatibility warnings.
- **Bundle supplemental data**: colocate waveforms, previews, and thumbnails in the ZIP so
  external tools can inspect the package without custom logic.
- **Automate validation**: extend `validate.ts` and associated tests to cover both storage
  modes, ensuring new packages are linted before distribution.

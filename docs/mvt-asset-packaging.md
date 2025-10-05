# MVT Asset Packaging Notes

## Current export behavior
- `exportScene` now falls back to `'zip-package'` when callers do not pass a storage mode,
  so user-triggered saves emit packaged scenes by default.
- The menu bar's `saveScene` action relies on that default and downloads `.mvt` archives
  that contain `document.json` and the asset payload tree.
- Packaged exports move MIDI cache payloads into `assets/midi/<id>/midi.json` and replace
  `timeline.midiCache` entries with lightweight `{ assetRef, assetId }` descriptors so the
  ZIP stays readable.
- Inline JSON remains available for debugging; when explicitly selected,
  `collectAudioAssets` embeds each audio buffer as Base64 and skips ZIP assembly.
- `.mvt` archives now include `Icon.icns` at the root so desktop shells show the branded
  document icon.

## Steps toward a more professional `.mvt` format
- **Pick a primary container**: default user exports to `'zip-package'`, retain inline JSON
  only for lightweight debugging, and update the downloader to prefer the `.mvt`
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

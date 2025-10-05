# Custom Font Upload Expansion Plan

**Status:** Draft

## Goals
- Allow users to upload custom font files (e.g., TTF, OTF, WOFF2) and use them within projects alongside existing Google/system fonts.
- Persist uploaded fonts per project so they can be re-used across sessions and exports.
- Ensure uploaded fonts render accurately in the canvas, timeline preview, and exported media.

## Key Workstreams
1. **File ingestion & validation**
   - Extend the existing font input UI with an "Upload" affordance that accepts common font file types.
   - Validate uploaded files (MIME/type sniffing, reasonable size limits) and surface friendly errors.
   - Parse font metadata (family name, available weights/styles) via `OpenType.js` or native browser APIs to integrate with the current weight selector.

2. **Persistence & caching**
   - Define a new persistence channel in `@persistence` to store font binaries (likely IndexedDB for browser sessions, with metadata mirrored in scene JSON for exports).
   - Add serialization hooks so uploaded fonts are embedded in saved scene files or referenced via project asset manifests.
   - Implement caching/invalidation to avoid re-uploading identical fonts and to release memory when fonts are deleted.

3. **Runtime loading**
   - Extend `@fonts/font-loader` with a path for custom binaries: create `FontFace` objects, register them with the document, and resolve promises when ready.
   - Update render pipelines (canvas + export workers) to preload custom fonts before drawing, handling fallbacks when fonts fail to load.

4. **UI/UX updates**
   - Enhance the font search dropdown to include an "Uploaded" section with previews and management actions (rename, remove).
   - Provide feedback during upload (progress indicator, success/error states) and indicate when a font is unavailable (e.g., missing weight).
   - Add affordances in project settings to review all uploaded fonts for the scene.

5. **Export considerations**
   - Ensure export bundles include embedded font files or data URIs so renders remain consistent across machines.
   - For video exports, confirm that the rendering backend has access to custom font data (possibly by bundling fonts into the worker payload).

## Open Questions
- Storage limits: should we enforce a per-project quota or total size cap for uploaded fonts?
- Sharing: when exporting a project file, do we inline fonts or require users to provide them separately (licensing implications)?
- De-duplication: how do we detect when two uploads represent the same font family/variant to avoid clutter?

## Next Steps
1. Prototype font ingestion using a single uploaded TTF file stored in memory; verify rendering pipeline integration.
2. Spike on persistence options (IndexedDB vs. bundling into scene JSON) and document trade-offs in `/docs`.
3. Design updated UI mocks for the font picker and management surfaces before implementation.

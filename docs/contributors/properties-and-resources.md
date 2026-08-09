# Properties and resources

## Property catalog and layouts

The property catalog normalizes plugin content schemas and host-node properties into descriptors
used by the inspector, automation timeline, and edit coordinator. Presentation codecs may display a
different unit while preserving the canonical stored value.

An SDK property group may provide serializable layout metadata containing property rows, compound
controls, nested sections, and patch actions. Layout metadata is UI presentation, not scene data.
Properties omitted from a layout still render in schema order.

`PropertyControlRegistry` owns the available controls and validates their semantic bindings. An
unknown control or incompatible binding falls back to ordinary scalar rows. Controls submit
canonical patches through the shared edit coordinator; they must not implement their own
automation, macro, or undo behavior.

## Visual assets

`VisualAssetRegistryStore` owns project assets and stable IDs. `VisualResourceCache` owns decoded
frame-ready resources. Lifecycle handles retain and release cache references, while `VisualMedia`
draws the resolved resource.

User images enter through the Asset Manager and are stored in `.mvt` packages. Plugin-bundled
images, grid atlases, and Sparrow atlases are resolved from the plugin archive. Do not construct
host resource handles directly; built-ins and plugins use their scoped asset context.

Supported `VisualMedia` fit modes are `contain`, `cover`, `fill`, and `clip`. Named animations and
loop modes are stored on decoded atlas resources and selected by the render object.

## Fonts

MVMNT treats font availability as project data:

- Project fonts are embedded in the `.mvt` package.
- Built-in fonts ship with MVMNT and remain portable.
- Device fonts are explicitly non-portable.
- Google Fonts is an acquisition source; selected static WOFF2 faces become project fonts.

Font selections use source-aware strings. Each project family owns variant metadata pointing to
content-addressed binaries. Import hydrates required variants before preview. Export performs a
strict preflight and stops when a referenced project payload is missing.

Google acquisition requires `VITE_GOOGLE_FONTS_API_KEY`. Without it, project, built-in, and device
fonts continue to work while new Google downloads are disabled.

## Persistence rules

Persist only stable asset IDs and source-aware font selections in property bindings. Package bytes
through the persistence asset indexes, and validate hashes and lengths during import. Resource
cache state, object URLs, decoded images, and installed `FontFace` instances are runtime-only.

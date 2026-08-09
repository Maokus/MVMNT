# Font system

MVMNT treats font availability as project data, not as a render-time web dependency.

## Sources

- **Project fonts** are embedded in the `.mvt` package. They may originate from a manual upload or from Google Fonts.
- **Google Fonts** is an online acquisition catalog. Selecting a family downloads every static WOFF2 face before the property changes; the resulting selection is a Project font.
- **Built-in fonts** ship with MVMNT. Inter is the portable offline default and does not add bytes to a project file.
- **Device fonts** come from the operating system and are explicitly non-portable.

Persisted font selections are source-aware strings (`Project:`, `BuiltIn:`, `Device:`, or `MissingGoogle:`). Plugin SDK font properties remain strings; plugin code should use the SDK `parseFontSelection` helper so the host can resolve project asset IDs to their installed family.

## Persistence and rendering

Each project font family owns variant metadata. Every weight/style variant points to a content-addressed binary in the renderer cache and is packaged separately under `assets/fonts/<asset>/<variant>/`. There is no project or per-file size limit; storage and package write failures are reported directly.

Scene import hydrates font variants before the first preview. Video, image-sequence, background, and CLI export run a strict font preflight and stop with an actionable error if a referenced Project font payload is missing. Rendering never requests a Google stylesheet or font file.

Schema v9 migrates legacy uploaded fonts to Project fonts, labels known operating-system families as Device fonts, and turns old Google-family selections into explicit missing references. When the Google Fonts API is configured and the app is online, import downloads and embeds those legacy families and marks the scene dirty so it can be resaved.

## Google Fonts configuration

The complete catalog uses `VITE_GOOGLE_FONTS_API_KEY` and requests WOFF2 metadata from the Google Fonts Developer API. Builds without a key keep Project, Built-in, and Device fonts fully functional, but disable new Google font acquisition with an explanatory UI state.

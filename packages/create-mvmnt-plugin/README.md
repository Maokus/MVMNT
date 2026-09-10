# create-mvmnt-plugin

This generator creates the manifest, TypeScript setup, development scripts, and first scene element
for an external MVMNT plugin. Read the [Plugin SDK guide](../../docs/plugin-api/README.md) for the
authoring model and learning path.

Create an external SDK 2 MVMNT plugin project:

```sh
npm create mvmnt-plugin@latest -- --name com.example.pulse --template minimal
```

Use `--template midi-spring` for a deterministic, fixed-step simulation example. Keep the default
`minimal` template for ordinary random-access elements.

The first element type defaults to the final plugin-ID segment. Use `--plugin-name`,
`--element-name`, and `--description` to customize generated display text, or `--dir <path>` to
choose the output location.

## Add another element

Run the same tool from an existing generated plugin:

```sh
cd pulse
npm create mvmnt-plugin@latest -- add spectrum --template audio-reactive
```

The `add` command reads the plugin identity from `plugin.json`, creates `src/spectrum.ts`, and adds
the matching entry and capability declaration to the manifest. Target another plugin directory
with `--dir <path>`, and customize the element with `--element-name` or `--description`.

The generator refuses duplicate element types and existing element files or template assets. It
only adds elements to SDK 2 plugins.

Run `npm create mvmnt-plugin@latest -- --help` for the complete option list.

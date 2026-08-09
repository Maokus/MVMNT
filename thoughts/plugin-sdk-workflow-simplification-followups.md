# Plugin SDK and workflow simplification follow-ups

Status: completed in SDK 2.2. See `docs/plugin-api/plugin-quickstart.md` for the canonical author
workflow and `docs/plugin-api/plugin-sdk-api-inventory.md` for the resulting surface.

Implementation outcome: generated projects own `dev`, `build`, `check`, and `typecheck` scripts through the
standalone `@mvmnt-app/plugin-tools` package; external capabilities live only in `plugin.json`; the SDK root and
callback API have one primary path; and every generator template uses typed `prop`, `group`, and `tab` builders and
is covered by generation, compilation, bundle, and definition smoke tests.

The implemented property API intentionally stays narrow: plugin instances can sample and integrate their own
effective property values, while binding and automation internals remain private. The following work would make
the rest of the SDK and external-plugin workflow similarly direct.

## 1. Establish one documented golden path

- Treat `docs/plugin-api/plugin-quickstart.md` as the canonical starting point and link to it consistently.
- Reconcile UI terminology such as **Scan** versus **Connect** in generated READMEs and development-workflow docs.
- Keep one minimal plugin example under automated typecheck, build, package, and host-load tests; derive snippets
  from it where practical to prevent drift.
- Add a short troubleshooting table keyed to the errors authors actually see from the generator, builder, loader,
  and development server.

## 2. Put plugin tooling in the generated project

Publish the reusable generator, validator, builder, and watcher logic as a versioned plugin-tools package. Generate
these scripts in plugin projects:

```json
{
    "scripts": {
        "dev": "mvmnt-plugin dev",
        "build": "mvmnt-plugin build",
        "check": "mvmnt-plugin check",
        "typecheck": "tsc --noEmit"
    }
}
```

`check` should typecheck, validate the manifest, validate public imports, bundle every entry, and perform a minimal
load/render smoke test. `dev` should serve the same archive and event protocol used by MVMNT's current watcher. The
application still needs to be running for visual preview, but authors should not need to invoke scripts from an
application checkout.

## 3. Remove duplicate capability declarations

External plugins currently repeat ordered `required` and `optional` arrays in `plugin.json` and
`definePluginElement()`. Make the manifest authoritative for external plugins and pass its declaration into the
runtime scope before evaluating callbacks. Keep any declaration needed by first-party elements in a host-only
registration wrapper rather than the public definition contract.

Acceptance criteria:

- An external element declares each capability once.
- The loader can still reject unavailable required capabilities before creating an instance.
- Undeclared facet access remains unavailable at runtime.
- Built-ins and external plugins use the same granted context shape after registration.

## 4. Standardise SDK discovery and imports

- Document callback-context methods as the primary way to use host services.
- Audit usage of the named one-line delegation adapters. Remove them before SDK 2 freezes if they have no concrete
  ergonomic benefit, rather than maintaining two names for every operation.
- Keep the root package focused on common authoring primitives and use domain subpaths for advanced audio, timing,
  rendering, and asset APIs.
- Audit and remove `CallbackElementRenderer`, `defineRendererElement`, and `insertElementConfig` from the public SDK
  if no supported external consumer remains. First-party transitional adapters should stay host-private.

## 5. Reduce schema boilerplate

- Convert all generator templates to the existing `prop` and `tab` builders so generated projects demonstrate the
  recommended inferred-props pattern.
- Add a small serializable `group()` builder rather than requiring deeply nested object literals for every element.
- Ensure builders remain plain DTO factories: inspector rendering, transforms, bindings, and persistence stay host
  concerns.
- Add generator snapshots for every template and compile all generated projects against the current SDK.

## Suggested order

1. Documentation terminology and golden-example checks.
2. Published plugin tooling plus generated `dev`, `build`, and `check` scripts.
3. Single-source capability declarations.
4. Adapter/root-export and transitional-renderer cleanup.
5. Schema-builder adoption and generator snapshots.

Each item should update the SDK package, injected runtime, machine-readable manifest, fixtures, documentation, and
contract-parity tests together when it changes public behavior.

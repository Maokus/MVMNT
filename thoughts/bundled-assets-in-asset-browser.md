# Bundled Assets in the Asset Browser

*Written 2026-04-24.*

---

## Current state: does the system work for bundled assets?

**Yes, bundled assets work correctly for rendering.** The path is:

1. Plugin element declares `private readonly _icon = this.bundledSprite('icon.png')` (or `bundledImage`).
2. On first call to `get()`, `BundledImageAssetSlot` fires `this._loader(filename)` → resolves via `bundledAssetRegistry` to a blob URL string.
3. That blob URL is passed to `ImageAssetSlot.update()`, which hits `visualAssetStore.load(url)` → decoded, cached, returned as a `VisualAsset`.
4. `VisualMedia.setAsset()` draws it.

**What does *not* work:**

- Bundled assets are invisible to the `VisualAssetRegistryStore` and therefore the `AssetManagerPanel`. They live as blob URLs inside `VisualAssetStore` but have no registry entry.
- They cannot be selected by name in an `assetRef` property dropdown — users cannot compose "use popcat1 as the idle sprite for this custom element" without uploading a copy themselves.
- There is no way to preview what bundled assets a plugin ships without reading source code.

The rendering path is solid. The UX story for bundled assets (discoverability, reuse, override) is absent.

---

## The proposal: un-deletable registry entries

The user proposes: **bundled assets appear in the AssetManagerPanel as un-deletable entries.**

This is the right call. Here is the analysis.

### Why it makes sense

1. **Discoverability.** When a user adds a PopcatMidiDisplay and sees popcat1/popcat2 appear in the panel, they immediately understand what images the element uses without inspecting the plugin.

2. **Override workflow.** The "idle sprite / active sprite" pattern (the element falls back to bundled if no asset is selected) only makes sense if the user can *see* the bundled defaults alongside their uploaded assets. Currently the dropdown for `imageAsset()` is empty by default, making it hard to even know what you'd be overriding.

3. **Consistency.** One panel shows all visual assets in the scene. Users don't have to think about "is this a bundled one or did I upload it?"

4. **No export burden.** Bundled assets do not need to be serialized. The plugin ZIP already ships them; they are reconstructed from blob URLs on load. Marking them `source: 'bundled'` lets `collectVisualAssets()` skip them cleanly.

### Design: what changes

#### `VisualAssetRegistryEntry`

Add two fields:

```typescript
interface VisualAssetRegistryEntry {
    id: string;
    name: string;
    file: File;
    type: VisualAssetType;
    // NEW:
    source: 'user' | 'bundled';   // defaults to 'user' for back-compat
    deletable: boolean;            // false for bundled entries
}
```

Alternatively, derive `deletable` from `source` — they are equivalent for now, but separating them allows a future "system asset" category (e.g. a set of built-in gradients that are not bundled per-plugin but are also not deletable).

#### `VisualAssetRegistryStore`

Add `addBundledEntry(id, name, blobUrl, type)`:

```typescript
addBundledEntry(id: string, name: string, blobUrl: string, type: VisualAssetType): void
```

This registers a non-deletable entry. The `file` field is tricky since `File` objects don't accept blob URLs — we have two options:

**Option A:** Change `VisualAssetRegistryEntry.file` type to `File | string`. `AssetRefSlot` already handles the `string | File | null` input path; it would need to handle string blob URLs as well (pass directly to `ImageAssetSlot` since they are valid `ImageSource` strings).

**Option B:** Convert the blob URL back to a `File` at registration time. Fetch the blob URL via `fetch(blobUrl).then(r => r.blob()).then(b => new File([b], name))`. Slightly heavier but keeps the type consistent.

**Recommendation: Option A** is simpler and avoids a second round-trip to decode something that's already in memory. The `VisualAssetRegistryEntry` can carry `url: string` alongside `file: File | null`, or use a union.

#### `BundledImageAssetSlot` / `BundledSprite`

After the blob URL resolves, register in the store:

```typescript
this._loader(this._filename).then(url => {
    this._url = url;
    this._loading = false;
    // Register in registry as non-deletable (idempotent — same ID on re-registration)
    visualAssetRegistryStore.getState().addBundledEntry(this._id, this._displayName, url, 'image');
})
```

The `id` should be stable — derive from `pluginId + ':' + filename`, e.g. `midipack1:popcat1.png`. This makes the entry idempotent (second PopcatMidiDisplay element that loads popcat1 does not create a second entry).

`onDestroy` does *not* deregister, since multiple elements may reference the same bundled asset. The entry remains for the session. If needed, reference-count the registrations and deregister when it hits zero.

#### `AssetManagerPanel`

Hide the delete button for non-deletable entries:

```tsx
{entry.deletable !== false && (
    <button onClick={() => removeAsset(entry.id)}>Delete</button>
)}
```

Optionally show a lock icon or "Plugin asset" badge to explain why it's not deletable.

#### Export pipeline

In `collectVisualAssets()`, skip bundled entries:

```typescript
for (const entry of Object.values(assets)) {
    if (entry.source === 'bundled') continue;  // provided by plugin, not user data
    // ... existing export logic
}
```

---

## Edge cases

**What if a user uploads a file that happens to be identical to a bundled asset?**
They get separate registry entries — one deletable, one not. The element's `assetRef` dropdown will show both. This is fine; the user explicitly chose to upload their own copy.

**What if the plugin that registered a bundled asset is removed from the scene?**
The entry stays until page reload (it's in-memory). This is acceptable — stale entries are invisible if no element references them. A cleanup pass on scene change is possible but not necessary for V1.

**What about the `AssetSelect` dropdown showing bundled assets?**
This is the key UX benefit: when a user sets "Idle Sprite" on PopcatMidiDisplay, they can choose from their own uploads *or* pick popcat1/popcat2 explicitly. This formalises what was previously an invisible default.

---

## Recommended implementation order

1. Extend `VisualAssetRegistryEntry` with `source` + `deletable` fields and `addBundledEntry()` store action.
2. Update `BundledImageAssetSlot` to call `addBundledEntry` after URL resolves, using a deterministic ID.
3. Update `AssetManagerPanel` to hide delete for non-deletable entries (add badge).
4. Update `collectVisualAssets()` to skip `source === 'bundled'` entries.
5. Update `AssetRefSlot` to handle `string` blob URLs (already works today — `AssetRefSlot` passes strings that aren't registry IDs to `ImageAssetSlot` directly after the registry lookup returns `null`... actually check this: it currently does `entry?.file ?? null` which would return `null` if the string is a blob URL not found in registry. So passing a bundled blob URL to `AssetRefSlot` would silently show nothing. The `addBundledEntry` approach in step 2 fixes this correctly by ensuring the ID is in the registry with its blob-URL-sourced File).

The work is estimated at 2–3 hours: schema change, store action, slot hook, panel tweak, export filter. No renderer changes needed.

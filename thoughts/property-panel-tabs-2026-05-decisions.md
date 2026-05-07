| Question                | Suggested decision                                             |
| ----------------------- | -------------------------------------------------------------- |
| Schema model            | `tabs` replaces `groups`                                       |
| Base properties         | Built-in first `Element` tab                                   |
| Plugin API              | Require `PropertyTab[]`                                        |
| Search                  | Keep compact search + `Cmd/Ctrl+F`; cross-tab results          |
| Reset/copy/paste        | Move to tab-strip overflow menu                                |
| Presets                 | Move to group header or group overflow                         |
| Active tab state        | Persist per element in scene store                             |
| Tab taxonomy            | A few (<5) canonical helpers plus escape hatch for custom tabs |
| Simple elements         | Allow one “Properties” tab                                     |
| `variant`               | Deprecate                                                      |
| Cross-tab `visibleWhen` | Allow, document, maybe lint later                              |
| Migration               | Separate schema migration from toolbar/action UX changes       |

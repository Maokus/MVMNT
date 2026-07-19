# @mvmnt-app/plugin-sdk

The public SDK for MVMNT 2.x scene-element plugins. Host capabilities are supplied through
the callback context created by `definePluginElement()`. Runtime classes such as render
objects are injected by MVMNT; using them outside the host produces an explicit error.

This package is the public contract, not a copy of the application. It owns serializable
definitions and portable helpers. Rendering, timeline/audio services, asset resolution,
and migration adapters are implemented by the host and injected at plugin load time.

Install it with `npm install @mvmnt-app/plugin-sdk`.

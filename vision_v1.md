Observe the serialization, deserialization and undo system. It is inelegant, because it uses a mixture of runtime state, store state, and ui state. This makes the processes more complex and difficult to maintain than they need to be.

I want to implement the following structure:

-   All document data, including macros, scene element data, and scene settings, are stored within a document store in zustand.
-   All data that is not meant to be persisted such as playhead position should be contained within a ui store, which will not be touched by the serialization/deserialization system and undo system.
-   This document store is considered the single source of truth for document data. The runtime should be a derived or a projected view of that state. Data should only flow in one way, from the document store to the runtime.
    -   the precise mechanism for a UI interaction is Mouse Event -> Handle calculates new properties -> Call an action on the document store (e.g useDocumentStore.getState().updateElementPosition(id, newX, newY)) -> Store updates, triggering subscribers (UI & reconciler) -> Reconciler rebuilds runtime.
-   A reconciliation pattern is used to catch and fix desyncronisation between the document and the runtime data.
    -   Non serializable data should be broken down into serializable objects and rehydrated into class instances during deserialization or runtime projection.
-   All operations (on the document store, not the ui store) should be captured using a diffed undo system (utilizing immer), and should be undoable. This includes changing sceneElement properties by clicking and dragging in the canvas, manually changing elements properties through the properties panel, adding elements, removing elements, adding macros, changing macro values, and any others which make sense.
    -   debounce the undo history capture for rapid updates and potentially batch reconciliation updates to avoid thrashing the runtime during operations with frequent updates like dragging. This debouncing/batching should be implemented at the Zustand action level, not inside the reconciler. An action like updateElementPosition should be debounced to only commit the final state to the store and history.

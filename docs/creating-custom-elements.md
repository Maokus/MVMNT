# Creating Custom Elements

_Last Updated: 10 February 2026_

This guide explains how to create custom scene elements for MVMNT using the plugin system.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Minimal Example Plugin](#minimal-example-plugin)
- [Plugin Manifest Reference](#plugin-manifest-reference)
- [Element API](#element-api)
- [Common Bindings](#common-bindings)
- [Categories and Organization](#categories-and-organization)
- [Testing and Debugging](#testing-and-debugging)
- [Packaging and Distribution](#packaging-and-distribution)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

_(To be completed in Phase 1)_

Custom elements extend MVMNT's visualization capabilities by providing new types of visual objects that can be added to scenes. Elements can react to audio, MIDI, or other data sources.

## Getting Started

_(To be completed in Phase 1)_

Prerequisites:
- Node.js 18+ installed
- MVMNT development environment set up
- Basic understanding of TypeScript and MVMNT's scene system

## Minimal Example Plugin

_(To be completed in Phase 1)_

This section will include a complete minimal working example.

## Plugin Manifest Reference

Custom elements are distributed as plugins with a `manifest.json` file. The manifest describes the plugin and its elements.

See [plugin-manifest.schema.json](plugin-manifest.schema.json) for the complete schema definition.

### Required Fields

- `id`: Unique plugin identifier (reverse domain notation recommended)
- `name`: Human-readable plugin name  
- `version`: Semantic version (e.g., `1.0.0`)
- `mvmntVersion`: Compatible MVMNT version range (e.g., `^1.0.0`)
- `elements`: Array of element definitions

### Optional Fields

_(To be completed in Phase 1)_

## Element API

_(To be completed in Phase 1)_

### Base Class

### Configuration Schema

### Render Methods

### Lifecycle Hooks

## Common Bindings

_(To be completed in Phase 1)_

### Audio Analysis Bindings

### MIDI Event Bindings

### Time-based Bindings

### Custom Bindings

## Categories and Organization

Elements are organized into categories in the UI. Available categories:

- `shapes`: Basic geometric shapes
- `effects`: Visual effects and filters
- `text`: Text rendering elements
- `particles`: Particle systems
- `audio-reactive`: Audio-driven visualizations
- `midi`: MIDI-driven elements
- `utility`: Helper/utility elements
- `custom`: Uncategorized custom elements

## Testing and Debugging

_(To be completed in Phase 1)_

### Local Development

### Developer Overlay

### Common Issues

## Packaging and Distribution

_(To be completed in Phase 1)_

### Building a Plugin

### Distribution Format

## Best Practices

_(To be completed in Phase 1)_

### Performance Considerations

### Naming Conventions

### Error Handling

## Troubleshooting

_(To be completed in Phase 1)_

### Element Not Appearing

### Render Issues

### Performance Problems

---

## Related Documentation

- [Plugin Manifest Schema](plugin-manifest.schema.json)
- [Architecture Overview](ARCHITECTURE.md)
- Scene System Documentation _(coming soon)_

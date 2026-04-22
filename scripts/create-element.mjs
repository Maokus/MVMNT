#!/usr/bin/env node
/**
 * Scaffold Script for Custom Elements
 * 
 * Creates a new custom element plugin with the following structure:
 * - src/plugins/{pluginName}/plugin.json
 * - src/plugins/{pluginName}/{elementType}.ts
 * 
 * Usage: npm run create-element
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Template mapping
const TEMPLATES = {
    'basic-shape': {
        file: 'basic-shape.ts',
        className: 'BasicShapeElement',
        description: 'Renders a basic shape (e.g., rectangle or circle)'
    },
    'audio-reactive': {
        file: 'audio-reactive.ts',
        className: 'AudioReactiveElement',
        description: 'Reacts to audio input (e.g., visualizes frequency spectrum or volume)'
    },
    'midi-notes': {
        file: 'midi-notes.ts',
        className: 'MidiNotesElement',
        description: 'Visualizes MIDI notes (e.g., piano roll or falling notes)'
    },
    'text-display': {
        file: 'text-display.ts',
        className: 'TextDisplayElement',
        description: 'Displays customizable text (e.g., song title, artist, or custom messages)'
    },
    'image-simple': {
        file: 'image-simple.ts',
        className: 'SimpleImageElement',
        description: 'Displays a static image or animated GIF from a file upload'
    },
    'image-atlas': {
        file: 'image-atlas.ts',
        className: 'AtlasImageElement',
        description: 'Animates a spritesheet divided into a uniform grid of frames'
    },
};

// Helper to prompt user input
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// Convert string to kebab-case
function toKebabCase(str) {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');
}

// Convert kebab-case to PascalCase
function toPascalCase(str) {
    return str
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}

// Convert kebab-case to Title Case
function toTitleCase(str) {
    return str
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Validate plugin name
function validatePluginName(name) {
    if (!name || name.length < 3) {
        return 'Plugin name must be at least 3 characters';
    }
    if (!/^[a-z0-9.-]+$/.test(name)) {
        return 'Plugin name can only contain lowercase letters, numbers, dots, and hyphens';
    }
    return null;
}

// Validate element type
function validateElementType(type) {
    if (!type || type.length < 1) {
        return 'Element type is required';
    }
    if (!/^[a-z][a-z0-9-]*$/.test(type)) {
        return 'Element type must start with a letter and contain only lowercase letters, numbers, and hyphens';
    }
    return null;
}

// Check if element type already exists within a specific plugin
function checkElementTypeUniqueness(elementType, pluginId) {
    // Check built-in elements (simplified check)
    const builtInTypes = [
        'background', 'image', 'progressDisplay', 'textOverlay', 'timeDisplay',
        'timeUnitPianoRoll', 'movingNotesPianoRoll', 'notesPlayedTracker',
        'notesPlayingDisplay', 'chordEstimateDisplay', 'audioSpectrum',
        'audioVolumeMeter', 'audioWaveform', 'audioLockedOscilloscope', 'debug'
    ];

    if (builtInTypes.includes(elementType)) {
        return `Element type "${elementType}" conflicts with a built-in element`;
    }

    // Check within the specific plugin only (different plugins may share type names —
    // the registry namespaces them as pluginId:elementType at load time)
    if (!pluginId) return null;

    const pluginsDir = path.join(projectRoot, 'src/plugins');
    if (!fs.existsSync(pluginsDir)) return null;

    const pluginDirName = pluginId.split('.').pop();
    const pluginJsonPath = path.join(pluginsDir, pluginDirName, 'plugin.json');
    if (!fs.existsSync(pluginJsonPath)) return null;

    try {
        const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
        if (pluginJson.elements?.some(el => el.type === elementType)) {
            return `Element type "${elementType}" already exists in this plugin`;
        }
    } catch (error) {
        console.warn(`Warning: Could not parse ${pluginJsonPath}`);
    }

    return null;
}

// Generate plugin.json
function generatePluginJson(pluginId, pluginName, elementType, entryFile) {
    return {
        id: pluginId,
        name: pluginName,
        version: '1.0.0',
        apiVersion: '^1.0.0',
        description: `Custom plugin`,
        author: 'Your Name',
        elements: [
            {
                type: elementType,
                entry: entryFile
            }
        ]
    };
}

// Add element to existing plugin.json
function addElementToPlugin(pluginJsonPath, elementType, entryFile) {
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));

    // Check if element type already exists in this plugin
    if (pluginJson.elements.some(el => el.type === elementType)) {
        throw new Error(`Element type "${elementType}" already exists in this plugin`);
    }

    // Add new element
    pluginJson.elements.push({
        type: elementType,
        entry: entryFile
    });

    fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2));
    return pluginJson;
}

// Customize template content
function customizeTemplate(templateContent, elementType, className, pluginId, elementName, elementDescription) {
    return templateContent
        .replace(/export class \w+Element/g, `export class ${className}`)
        .replace(/super\('[\w-]+'/g, `super('${elementType}'`)
        .replace(/constructor\(id: string = '\w+'/g, `constructor(id: string = '${elementType}'`)
        .replace(/category: '[^']+'/g, `category: '${pluginId}'`)
        .replace(/name: '[^']+'/, `name: '${elementName}'`)
        .replace(/description: '[^']+'/, `description: '${elementDescription}'`);
}

async function main() {
    console.log('='.repeat(60));
    console.log('MVMNT Custom Element Scaffold');
    console.log('='.repeat(60));
    console.log();

    // Step 1: Get plugin ID
    let pluginId = await prompt('Plugin ID (e.g., myplugin or com.example.myplugin): ');
    let validationError = validatePluginName(pluginId);
    while (validationError) {
        console.error(`Error: ${validationError}`);
        pluginId = await prompt('Plugin ID (e.g., myplugin or com.example.myplugin): ');
        validationError = validatePluginName(pluginId);
    }

    // Determine plugin directory and decide whether to prompt for plugin display name.
    const pluginsDir = path.join(projectRoot, 'src/plugins');
    const pluginDirName = pluginId.split('.').pop();
    const pluginDir = path.join(pluginsDir, pluginDirName);

    let pluginName;
    if (fs.existsSync(pluginDir)) {
        // If plugin folder exists, use its plugin.json name if present.
        const existingPluginJson = path.join(pluginDir, 'plugin.json');
        if (fs.existsSync(existingPluginJson)) {
            try {
                const existing = JSON.parse(fs.readFileSync(existingPluginJson, 'utf8'));
                pluginName = existing.name;
            } catch (e) {
                // will be derived from element ID below
            }
        }
    }

    // Prompt for plugin name only when creating a new plugin
    if (!pluginName) {
        const defaultPluginName = toTitleCase(pluginId.split('.').pop());
        pluginName = (await prompt(`Plugin Name (e.g., My Plugin) [${defaultPluginName}]: `)) || defaultPluginName;
    }

    // Step 2: Get element ID
    let elementType = await prompt('Element ID (kebab-case, e.g., my-element): ');
    elementType = toKebabCase(elementType);
    validationError = validateElementType(elementType);
    while (validationError) {
        console.error(`Error: ${validationError}`);
        elementType = await prompt('Element ID (kebab-case, e.g., my-element): ');
        elementType = toKebabCase(elementType);
        validationError = validateElementType(elementType);
    }

    // Check uniqueness within plugin (different plugins may share type names —
    // the registry namespaces them as pluginId:elementType at load time)
    const uniquenessError = checkElementTypeUniqueness(elementType, pluginId);
    if (uniquenessError) {
        console.error(`Error: ${uniquenessError}`);
        process.exit(1);
    }

    // Step 3: Get element display name and description
    const defaultElementName = toTitleCase(elementType);
    const elementName = (await prompt(`Element Display Name (e.g., My Element) [${defaultElementName}]: `)) || defaultElementName;
    const elementDescription = (await prompt('Element Description (e.g., A custom visualizer element): ')) || `A custom ${elementName.toLowerCase()} element`;

    // Step 4: Choose template
    console.log('\nAvailable templates:');
    const templateKeys = Object.keys(TEMPLATES);
    templateKeys.forEach((key, index) => {
        console.log(`  ${index + 1}. ${key} - ${TEMPLATES[key].description}`);
    });

    const templateChoice = await prompt(`Choose template (1-${templateKeys.length}): `);
    const templateIndex = parseInt(templateChoice) - 1;

    if (templateIndex < 0 || templateIndex >= templateKeys.length) {
        console.error('Error: Invalid template choice');
        process.exit(1);
    }
    
    const templateKey = templateKeys[templateIndex];
    const template = TEMPLATES[templateKey];
    
    // Step 5: Create files
    console.log('\n' + '='.repeat(60));
    console.log('Creating element...');
    console.log('='.repeat(60));
    
    const pluginJsonPath = path.join(pluginDir, 'plugin.json');
    const entryFile = `${elementType}.ts`;
    const elementFile = path.join(pluginDir, entryFile);
    
    // Create plugin directory if needed
    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
        console.log(`✓ Created plugins directory`);
    }
    
    const pluginExists = fs.existsSync(pluginDir);
    let pluginJson;
    
    if (pluginExists) {
        // Add to existing plugin
        console.log(`Plugin already exists, adding element to existing plugin`);
        
        if (!fs.existsSync(pluginJsonPath)) {
            console.error(`Error: Plugin directory exists but plugin.json is missing: ${pluginDir}`);
            process.exit(1);
        }
        
        if (fs.existsSync(elementFile)) {
            console.error(`Error: Element file already exists: ${elementFile}`);
            process.exit(1);
        }
        
        pluginJson = addElementToPlugin(pluginJsonPath, elementType, entryFile);
        console.log(`✓ Updated plugin.json (now has ${pluginJson.elements.length} elements)`);
    } else {
        // Create new plugin
        fs.mkdirSync(pluginDir, { recursive: true });
        console.log(`✓ Created plugin directory: ${path.relative(projectRoot, pluginDir)}`);
        
        // Generate plugin.json
        pluginJson = generatePluginJson(
            pluginId,
            pluginName,
            elementType,
            entryFile
        );
        
        fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2));
        console.log(`✓ Created plugin.json`);
    }
    
    // Copy and customize template
    const templatePath = path.join(projectRoot, 'src/core/scene/elements/_templates', template.file);
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const className = `${toPascalCase(elementType)}Element`;
    const customizedContent = customizeTemplate(
        templateContent,
        elementType,
        className,
        pluginId,
        elementName,
        elementDescription
    );
    
    fs.writeFileSync(elementFile, customizedContent);
    console.log(`✓ Created element file: ${path.relative(projectRoot, elementFile)}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('Success!');
    console.log('='.repeat(60));
    console.log(`\nElement "${elementType}" added to plugin: ${pluginJson.name}`);
    console.log(`Plugin location: ${path.relative(projectRoot, pluginDir)}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Start the dev server: npm run dev`);
    console.log(`  2. Open the app and add your element to a scene`);
    console.log(`  3. Edit ${path.relative(projectRoot, elementFile)} to customize`);
    if (pluginJson.elements.length > 1) {
        console.log(`\nThis plugin now has ${pluginJson.elements.length} elements:`);
        pluginJson.elements.forEach(el => console.log(`  - (${el.type})`));
    }
    console.log(`\nSee docs/creating-custom-elements.md for more information.`);
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});

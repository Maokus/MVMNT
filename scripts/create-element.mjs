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
        name: 'Basic Shape',
        description: 'A customizable geometric shape',
        category: 'Custom',
    },
    'audio-reactive': {
        file: 'audio-reactive.ts',
        className: 'AudioReactiveElement',
        name: 'Audio Reactive',
        description: 'Shape that reacts to audio volume',
        category: 'Custom',
    },
    'midi-notes': {
        file: 'midi-notes.ts',
        className: 'MidiNotesElement',
        name: 'MIDI Notes',
        description: 'Display currently playing MIDI notes',
        category: 'Custom',
    },
    'text-display': {
        file: 'text-display.ts',
        className: 'TextDisplayElement',
        name: 'Text Display',
        description: 'Display customizable text',
        category: 'Custom',
    },
};

const CATEGORIES = [
    'shapes',
    'effects',
    'text',
    'particles',
    'audio-reactive',
    'midi',
    'utility',
    'custom'
];

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

// Check if element type already exists
function checkElementTypeUniqueness(elementType) {
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
    
    // Check existing plugins
    const pluginsDir = path.join(projectRoot, 'src/plugins');
    if (!fs.existsSync(pluginsDir)) {
        return null;
    }
    
    const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());
    
    for (const dir of pluginDirs) {
        const pluginJsonPath = path.join(pluginsDir, dir.name, 'plugin.json');
        if (fs.existsSync(pluginJsonPath)) {
            try {
                const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
                if (pluginJson.elements) {
                    for (const element of pluginJson.elements) {
                        if (element.type === elementType) {
                            return `Element type "${elementType}" already exists in plugin "${pluginJson.name}"`;
                        }
                    }
                }
            } catch (error) {
                console.warn(`Warning: Could not parse ${pluginJsonPath}`);
            }
        }
    }
    
    return null;
}

// Generate plugin.json
function generatePluginJson(pluginId, pluginName, elementType, elementName, elementDescription, entryFile) {
    return {
        id: pluginId,
        name: pluginName,
        version: '1.0.0',
        mvmntVersion: '^0.14.0',
        description: `Custom plugin providing ${elementName}`,
        author: 'Your Name',
        elements: [
            {
                type: elementType,
                name: elementName,
                category: pluginName, // Use plugin ID as category
                description: elementDescription,
                entry: entryFile
            }
        ]
    };
}

// Add element to existing plugin.json
function addElementToPlugin(pluginJsonPath, elementType, elementName, elementDescription, entryFile) {
    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    
    // Check if element type already exists in this plugin
    if (pluginJson.elements.some(el => el.type === elementType)) {
        throw new Error(`Element type "${elementType}" already exists in this plugin`);
    }
    
    // Add new element
    pluginJson.elements.push({
        type: elementType,
        name: elementName,
        category: pluginJson.id, // Use plugin ID as category
        description: elementDescription,
        entry: entryFile
    });
    
    // Update description if it was auto-generated
    if (pluginJson.elements.length > 1) {
        pluginJson.description = `Custom plugin providing ${pluginJson.elements.length} elements`;
    }
    
    fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2));
    return pluginJson;
}

// Customize template content
function customizeTemplate(templateContent, elementType, className, elementName, elementDescription, pluginId) {
    return templateContent
        .replace(/export class \w+Element/g, `export class ${className}`)
        .replace(/super\('[\w-]+'/g, `super('${elementType}'`)
        .replace(/constructor\(id: string = '\w+'/g, `constructor(id: string = '${elementType}'`)
        .replace(/name: '[^']+'/g, `name: '${elementName}'`)
        .replace(/description: '[^']+'/g, `description: '${elementDescription}'`)
        .replace(/category: '[^']+'/g, `category: '${pluginId}'`);
}

async function main() {
    console.log('='.repeat(60));
    console.log('MVMNT Custom Element Scaffold');
    console.log('='.repeat(60));
    console.log();
    
    // Step 1: Get plugin name
    let pluginId = await prompt('Plugin ID (e.g., myplugin): ');
    let validationError = validatePluginName(pluginId);
    while (validationError) {
        console.error(`Error: ${validationError}`);
        pluginId = await prompt('Plugin ID (e.g., myplugin): ');
        validationError = validatePluginName(pluginId);
    }
    
    // Determine plugin directory and decide whether to prompt for plugin display name.
    const pluginsDir = path.join(projectRoot, 'src/plugins');
    const pluginDirName = pluginId.split('.').pop();
    const pluginDir = path.join(pluginsDir, pluginDirName);

    let pluginName;
    if (fs.existsSync(pluginDir)) {
        // If plugin folder exists, use its plugin.json name if present, otherwise derive a title-case name.
        const existingPluginJson = path.join(pluginDir, 'plugin.json');
        if (fs.existsSync(existingPluginJson)) {
            try {
                const existing = JSON.parse(fs.readFileSync(existingPluginJson, 'utf8'));
                pluginName = existing.name || toTitleCase(pluginDirName);
            } catch (e) {
                pluginName = toTitleCase(pluginDirName);
            }
        } else {
            pluginName = toTitleCase(pluginDirName);
        }
    } else {
        pluginName = await prompt('Plugin Name (e.g., My Plugin): ') || toTitleCase(pluginDirName);
    }
    
    // Step 2: Get element type
    let elementType = await prompt('Element ID (kebab-case, e.g., my-element): ');
    elementType = toKebabCase(elementType);
    validationError = validateElementType(elementType);
    while (validationError) {
        console.error(`Error: ${validationError}`);
        elementType = await prompt('Element ID (kebab-case, e.g., my-element): ');
        elementType = toKebabCase(elementType);
        validationError = validateElementType(elementType);
    }
    
    // Check uniqueness
    const uniquenessError = checkElementTypeUniqueness(elementType);
    if (uniquenessError) {
        console.error(`Error: ${uniquenessError}`);
        process.exit(1);
    }
    
    const elementName = await prompt(`Element Display Name [${toTitleCase(elementType)}]: `) || toTitleCase(elementType);
    const elementDescription = await prompt('Element Description: ') || `A custom ${elementName} element`;
    
    // Step 3: Choose template
    console.log('\nAvailable templates:');
    Object.keys(TEMPLATES).forEach((key, index) => {
        console.log(`  ${index + 1}. ${key} - ${TEMPLATES[key].description}`);
    });
    
    const templateChoice = await prompt('Choose template (1-4): ');
    const templateIndex = parseInt(templateChoice) - 1;
    const templateKeys = Object.keys(TEMPLATES);
    
    if (templateIndex < 0 || templateIndex >= templateKeys.length) {
        console.error('Error: Invalid template choice');
        process.exit(1);
    }
    
    const templateKey = templateKeys[templateIndex];
    const template = TEMPLATES[templateKey];
    
    // Step 4: Create files
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
        
        pluginJson = addElementToPlugin(pluginJsonPath, elementType, elementName, elementDescription, entryFile);
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
            elementName,
            elementDescription,
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
        elementName,
        elementDescription,
        pluginId
    );
    
    fs.writeFileSync(elementFile, customizedContent);
    console.log(`✓ Created element file: ${path.relative(projectRoot, elementFile)}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('Success!');
    console.log('='.repeat(60));
    console.log(`\nElement "${elementName}" (${elementType}) added to plugin: ${pluginJson.name}`);
    console.log(`Plugin location: ${path.relative(projectRoot, pluginDir)}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Start the dev server: npm run dev`);
    console.log(`  2. Open the app and add your element to a scene`);
    console.log(`  3. Edit ${path.relative(projectRoot, elementFile)} to customize`);
    if (pluginJson.elements.length > 1) {
        console.log(`\nThis plugin now has ${pluginJson.elements.length} elements:`);
        pluginJson.elements.forEach(el => console.log(`  - ${el.name} (${el.type})`));
    }
    console.log(`\nSee docs/creating-custom-elements.md for more information.`);
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});

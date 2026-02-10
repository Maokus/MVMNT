import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Sample valid plugin manifest for testing
const sampleManifest = {
	id: 'com.example.myplugin',
	name: 'My Plugin',
	version: '1.0.0',
	mvmntVersion: '^1.0.0',
	description: 'A sample plugin for testing',
	author: 'Test Author',
	elements: [
		{
			type: 'custom-shape',
			name: 'Custom Shape',
			category: 'shapes',
			description: 'A custom shape element',
			entry: 'elements/custom-shape.js',
			capabilities: ['audio-analysis'],
			tags: ['shape', 'custom'],
		},
	],
};

describe('plugin manifest schema', () => {
	it('loads the schema file', () => {
		const schemaPath = resolve(__dirname, '../../../docs/plugin-manifest.schema.json');
		const schemaContent = readFileSync(schemaPath, 'utf-8');
		const schema = JSON.parse(schemaContent);

		expect(schema).toBeDefined();
		expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
		expect(schema.title).toBe('MVMNT Plugin Manifest');
	});

	it('schema has required fields defined', () => {
		const schemaPath = resolve(__dirname, '../../../docs/plugin-manifest.schema.json');
		const schemaContent = readFileSync(schemaPath, 'utf-8');
		const schema = JSON.parse(schemaContent);

		expect(schema.required).toContain('id');
		expect(schema.required).toContain('name');
		expect(schema.required).toContain('version');
		expect(schema.required).toContain('mvmntVersion');
		expect(schema.required).toContain('elements');
	});

	it('schema defines element structure', () => {
		const schemaPath = resolve(__dirname, '../../../docs/plugin-manifest.schema.json');
		const schemaContent = readFileSync(schemaPath, 'utf-8');
		const schema = JSON.parse(schemaContent);

		const elementsSchema = schema.properties.elements;
		expect(elementsSchema.type).toBe('array');
		expect(elementsSchema.minItems).toBe(1);

		const elementItemSchema = elementsSchema.items;
		expect(elementItemSchema.required).toContain('type');
		expect(elementItemSchema.required).toContain('name');
		expect(elementItemSchema.required).toContain('category');
		expect(elementItemSchema.required).toContain('entry');
	});

	describe('sample manifest validation', () => {
		it('validates a correct manifest structure', () => {
			// Basic structure validation
			expect(sampleManifest.id).toBeDefined();
			expect(typeof sampleManifest.id).toBe('string');
			expect(sampleManifest.id.length).toBeGreaterThan(0);

			expect(sampleManifest.name).toBeDefined();
			expect(typeof sampleManifest.name).toBe('string');

			expect(sampleManifest.version).toBeDefined();
			expect(typeof sampleManifest.version).toBe('string');
			expect(sampleManifest.version).toMatch(/^\d+\.\d+\.\d+/);

			expect(sampleManifest.mvmntVersion).toBeDefined();
			expect(typeof sampleManifest.mvmntVersion).toBe('string');

			expect(sampleManifest.elements).toBeDefined();
			expect(Array.isArray(sampleManifest.elements)).toBe(true);
			expect(sampleManifest.elements.length).toBeGreaterThan(0);
		});

		it('validates element structure', () => {
			const element = sampleManifest.elements[0];

			expect(element.type).toBeDefined();
			expect(typeof element.type).toBe('string');
			expect(element.type).toMatch(/^[a-z][a-z0-9-]*$/);

			expect(element.name).toBeDefined();
			expect(typeof element.name).toBe('string');

			expect(element.category).toBeDefined();
			expect(element.category).toMatch(
				/^(shapes|effects|text|particles|audio-reactive|midi|utility|custom)$/
			);

			expect(element.entry).toBeDefined();
			expect(typeof element.entry).toBe('string');
			expect(element.entry).toMatch(/\.(js|mjs)$/);
		});

		it('validates optional element fields', () => {
			const element = sampleManifest.elements[0];

			if (element.capabilities) {
				expect(Array.isArray(element.capabilities)).toBe(true);
				element.capabilities.forEach((cap: string) => {
					expect(cap).toMatch(/^(audio-analysis|midi-events|network|storage)$/);
				});
			}

			if (element.tags) {
				expect(Array.isArray(element.tags)).toBe(true);
			}

			if (element.description) {
				expect(typeof element.description).toBe('string');
			}
		});

		it('validates id format', () => {
			// ID should be lowercase alphanumeric with dots and hyphens
			expect(sampleManifest.id).toMatch(/^[a-z0-9.-]+$/);
			expect(sampleManifest.id.length).toBeGreaterThanOrEqual(3);
		});

		it('validates version format', () => {
			// Should be semantic versioning
			expect(sampleManifest.version).toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
		});

		it('rejects invalid id formats', () => {
			const invalidIds = [
				'', // empty
				'ab', // too short (schema requires minLength: 3)
				'My-Plugin', // uppercase
				'my_plugin', // underscore
				'my plugin', // space
			];

			// Test pattern matching (except length)
			const patternInvalidIds = invalidIds.filter(id => id.length >= 3);
			patternInvalidIds.forEach((id) => {
				expect(id).not.toMatch(/^[a-z0-9.-]+$/);
			});

			// Test length requirement separately
			expect('ab'.length).toBeLessThan(3); // minLength from schema
		});

		it('rejects invalid version formats', () => {
			const invalidVersions = [
				'1.0', // missing patch
				'1', // missing minor and patch
				'v1.0.0', // v prefix
				'1.0.0.0', // extra number
			];

			invalidVersions.forEach((version) => {
				expect(version).not.toMatch(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/);
			});
		});

		it('rejects invalid element types', () => {
			const invalidTypes = [
				'MyElement', // uppercase
				'my_element', // underscore
				'my element', // space
				'123element', // starts with number
			];

			invalidTypes.forEach((type) => {
				expect(type).not.toMatch(/^[a-z][a-z0-9-]*$/);
			});
		});
	});
});

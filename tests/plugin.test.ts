import { describe, expect, it } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import BasesCardWrapPlugin from '../src/main';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import manifest from '../manifest.json';

describe('BasesCardWrapPlugin', () => {
	it('loads with default settings against an in-memory vault', async () => {
		const app = App.createConfigured__({ files: { 'notes/a.md': '# Hello world' } });
		const plugin = new BasesCardWrapPlugin(app as never, manifest as never);
		await plugin.loadSettings();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	it('repairs bad saved settings', () => {
		expect(normalizeSettings({ views: 5 as never })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		// A key without the separator and a rule that changes nothing are dropped.
		expect(normalizeSettings({ views: { 'Q.base': { props: {}, all: { mode: 'wrap', lines: 2 } }, 'Q.base\u0000V': { props: {}, all: { mode: 'core', lines: 3 } } } as never })).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({ views: { 'Q.base\u0000V': { props: {}, all: { mode: 'clamp', lines: 2 } } } as never }).views).toEqual({ 'Q.base\u0000V': { props: {}, all: { mode: 'clamp', lines: 2 } } });
		expect(normalizeSettings({ vaultDefault: { props: {}, all: { mode: 'core' } } as never }).vaultDefault).toBeNull();
	});
});

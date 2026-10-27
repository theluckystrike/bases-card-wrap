import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, Modal, Notice } from 'obsidian-test-mocks/obsidian';
import type { SponsorsManager } from '../src/license/index';
import BasesCardWrapPlugin from '../src/main';
import { BasesCardWrapSettingTab } from '../src/settings';
import { PRO_DEFAULT, bindPro, resetPro } from '../src/pro';
import manifest from '../manifest.json';

// A free user can select the Vault default row of the settings. The select shows the shared Pro notice with the
// "Sponsor on GitHub" button. No rule window opens and nothing is saved.
const PITCH = 'Sponsor on GitHub, then sign in from the plugin settings.';

function fakePro(pro: boolean): SponsorsManager {
	return {
		isPro: () => pro,
		onChange: () => () => undefined,
		hasToken: () => false,
		isChecking: () => false,
		getState: () => ({ status: 'unchecked', lastAttemptAt: 0 }),
		config: { sponsorLogin: 'theluckystrike', source: 'bases-card-wrap' },
	} as unknown as SponsorsManager;
}

function setup(pro: boolean) {
	const app = App.createConfigured__({ files: {} });
	const plugin = new BasesCardWrapPlugin(app as never, manifest as never);
	bindPro(fakePro(pro));
	const shown: { text: string; buttons: number }[] = [];
	vi.spyOn(Notice.prototype as unknown as { constructor__(): void }, 'constructor__').mockImplementation(function (this: Notice) {
		shown.push({ text: this.messageEl.textContent ?? '', buttons: this.messageEl.querySelectorAll('.pf-pro-notice-sponsor').length });
	});
	const opened = vi.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
	const saveData = vi.spyOn(plugin, 'saveData').mockResolvedValue(undefined);
	const tab = new BasesCardWrapSettingTab(app as never, plugin);
	const row = (tab.getSettingDefinitions() as { name?: string; action?: () => void; disabled?: () => boolean }[]).find((d) => d.name === 'Vault default')!;
	return { plugin, shown, opened, saveData, row };
}

describe('Vault default (Pro)', () => {
	afterEach(() => { resetPro(); vi.restoreAllMocks(); });

	it('a free user who selects Vault default gets the Pro notice with a Sponsor button, and no rule window opens', () => {
		const { plugin, shown, opened, saveData, row } = setup(false);
		expect(row.disabled?.() ?? false).toBe(false);
		row.action!();
		expect(shown).toEqual([{ text: `${PRO_DEFAULT} ${PITCH}Sponsor on GitHub`, buttons: 1 }]);
		expect(opened).not.toHaveBeenCalled();
		expect(saveData).not.toHaveBeenCalled();
		expect(plugin.settings.vaultDefault ?? null).toBeNull();
	});

	it('a Pro user who selects Vault default gets the rule window, with no Pro notice', () => {
		const { shown, opened, row } = setup(true);
		row.action!();
		expect(opened).toHaveBeenCalledOnce();
		expect(shown).toEqual([]);
	});
});

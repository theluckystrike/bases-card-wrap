import { browser, expect } from '@wdio/globals';
import type { SponsorsManager } from '../../src/license/index';
import { pluginId } from './load';

// A free user can select the Vault default row of the settings. The select shows the shared Pro notice with the
// "Sponsor on GitHub" button, and no rule window opens. A Pro user gets the rule window.
type Host = { plugins: { plugins: Record<string, { pro: SponsorsManager; loadData(): Promise<unknown> }> }; setting: { open(): void; close(): void; openTabById(id: string): void } };

async function setPro(on: boolean): Promise<boolean> {
	return browser.executeObsidian(async ({ app }, enabled, id) => {
		const pro = (app as unknown as Host).plugins.plugins[id]!.pro;
		if (!enabled) { pro.signOut(); return pro.isPro(); }
		// Synthetic token store and HTTP answer. No network request or Keychain key.
		let token: string | null = 'gho_' + '0'.repeat(36);
		pro.opts.tokens.get = () => token; pro.opts.tokens.set = (v) => { token = v; }; pro.opts.tokens.clear = () => { token = null; };
		pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'demo-reader', totalSponsorshipAmountAsSponsorInCents: 1500 }, user: { viewerIsSponsoring: true, sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
		await pro.refreshNow();
		return pro.isPro();
	}, on, pluginId);
}

/** Opens the settings tab, selects the Vault default row, then reads the notices, the open rule window and the data. */
async function selectDefault() {
	await browser.executeObsidian(({ app }, id) => {
		activeDocument.querySelectorAll('.notice').forEach((n) => n.remove());
		const s = (app as unknown as Host).setting; s.open(); s.openTabById(id);
	}, pluginId);
	await browser.waitUntil(async () => browser.executeObsidian(() => [...activeDocument.querySelectorAll('.setting-item-name')].some((e) => e.textContent === 'Vault default')), { timeout: 10000, timeoutMsg: 'The settings tab drew no Vault default row' });
	return browser.executeObsidian(async ({ app }, id) => {
		const row = [...activeDocument.querySelectorAll('.setting-item')].find((r) => r.querySelector('.setting-item-name')?.textContent === 'Vault default') as HTMLElement;
		const before = JSON.stringify((await (app as unknown as Host).plugins.plugins[id]!.loadData()) ?? {});
		row.click();
		await new Promise((r) => setTimeout(r, 400));
		const window = [...activeDocument.querySelectorAll('.modal')].some((m) => m.textContent?.includes('Card wrap: vault default'));
		return {
			notices: [...activeDocument.querySelectorAll('.notice')].map((n) => ({ text: n.textContent ?? '', sponsor: n.querySelectorAll('.pf-pro-notice-sponsor').length })),
			window,
			same: JSON.stringify((await (app as unknown as Host).plugins.plugins[id]!.loadData()) ?? {}) === before,
		};
	}, pluginId);
}

describe('Vault default (Pro)', function () {
	afterEach(async () => {
		await browser.executeObsidian(({ app }) => {
			activeDocument.querySelectorAll('.modal').forEach((m) => { if (m.textContent?.includes('Card wrap: vault default')) (m.querySelector('.modal-close-button') as HTMLElement | null)?.click(); });
			(app as unknown as Host).setting.close();
		});
		await setPro(false);
	});

	it('a free user who selects Vault default gets a Pro notice with a Sponsor button, and no rule window opens', async () => {
		expect(await setPro(false)).toBe(false);
		const after = await selectDefault();
		if (!after.notices.some((n) => n.text.includes('A vault default rule needs Pro.') && n.sponsor === 1)) throw new Error(`No Pro notice after Vault default: ${JSON.stringify(after.notices)}`);
		expect(after.window).toBe(false);
		expect(after.same).toBe(true);
	});

	it('a Pro user who selects Vault default gets the rule window, with no Sponsor notice', async () => {
		expect(await setPro(true)).toBe(true);
		const after = await selectDefault();
		expect(after.window).toBe(true);
		expect(after.notices.filter((n) => n.sponsor > 0)).toEqual([]);
	});
});

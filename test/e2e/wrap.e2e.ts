import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { pluginId } from './load';

// Acceptance tests A1 to A10 of the spec, in the core Bases cards view.
const DIR = 'Bases Card Wrap';
const BASE = `${DIR}/Quotes.base`;
const SEP = '\u0000';
const KEY = `${BASE}${SEP}Quotes`;
const ORDER = ['file.name', 'quote', 'author', 'added', 'tags'];

interface Rule {
	props: Record<string, { mode: string; lines: number }>;
	all: { mode: string; lines: number };
}

interface Card {
	top: number;
	bottom: number;
	left: number;
	/** clientHeight, scrollHeight and line height (px) of each property line, title first. */
	lines: { h: number; sh: number; lh: number; text: string; textW: number; ws: string; slot: number }[];
	/** Bottom of the last property element. */
	contentBottom: number;
}

interface Probe {
	on: boolean;
	cards: Card[];
	scrollTop: number;
}

async function setRule(key: string, rule: Rule | null): Promise<void> {
	await browser.executeObsidian(async ({ app }, id, k, r) => {
		const plugin = (app as unknown as { plugins: { plugins: Record<string, { setViewRule(k: string, r: unknown): Promise<void> }> } }).plugins.plugins[id]!;
		await plugin.setViewRule(k, r);
	}, pluginId, key, rule);
	await browser.pause(400);
}

async function settingsViews(): Promise<string[]> {
	return browser.executeObsidian(({ app }, id) => {
		const plugin = (app as unknown as { plugins: { plugins: Record<string, { settings: { views: Record<string, unknown> } }> } }).plugins.plugins[id]!;
		return Object.keys(plugin.settings.views);
	}, pluginId);
}

/** Measures the visible cards of the first shown cards view in the active tab (index picks a later view). */
async function probe(index = 0): Promise<Probe | null> {
	return browser.execute((i: number) => {
		const views = Array.from(document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .bases-view[data-view-type="cards"]')).filter((v) => v.offsetParent !== null);
		const v = views[i];
		if (!v) return null;
		const items = Array.from(v.querySelectorAll<HTMLElement>('.bases-cards-item')).filter((c) => { const o = (c.parentElement as HTMLElement).style.opacity; return o === '' || Number(o) >= 0.1; });
		const cards = items.map((c) => {
			const r = c.getBoundingClientRect();
			const props = Array.from(c.querySelectorAll<HTMLElement>(':scope > .bases-cards-property'));
			const lines = props.map((p) => {
				const line = p.querySelector<HTMLElement>('.bases-cards-line')!;
				const cs = getComputedStyle(line);
				const range = document.createRange();
				range.selectNodeContents(line);
				return { h: line.clientHeight, sh: line.scrollHeight, lh: parseFloat(cs.lineHeight) || 0, text: line.innerText, textW: Math.round(range.getBoundingClientRect().width), ws: cs.whiteSpace, slot: p.clientHeight - (p.querySelector<HTMLElement>('.bases-cards-label')?.offsetHeight ?? 0) };
			});
			const last = props[props.length - 1];
			return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), lines, contentBottom: last ? Math.round(last.getBoundingClientRect().bottom) : Math.round(r.top) };
		});
		return { on: v.classList.contains('bcw-on'), cards, scrollTop: Math.round(v.scrollTop) };
	}, index);
}

async function lastNoticeText(): Promise<string> {
	return browser.execute(() => Array.from(document.querySelectorAll<HTMLElement>('.notice')).map((n) => n.innerText).join('\n'));
}

/** Opens the settings tab of the plugin and gives its text. */
async function settingsText(): Promise<string> {
	return browser.executeObsidian(async ({ app }, id) => {
		const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void; close(): void } }).setting;
		setting.open();
		setting.openTabById(id);
		let text = '';
		for (let i = 0; i < 30 && !text.includes('Saved views'); i++) {
			await new Promise((r) => setTimeout(r, 100));
			const tab = (setting as unknown as { activeTab?: { containerEl?: HTMLElement } }).activeTab;
			text = tab?.containerEl?.innerText ?? '';
		}
		setting.close();
		return text;
	}, pluginId);
}

async function openBase(path = BASE): Promise<void> {
	await obsidianPage.openFile(path);
	await browser.waitUntil(async () => ((await probe())?.cards.length ?? 0) > 0, { timeout: 20000, timeoutMsg: 'no cards' });
	await browser.pause(300);
}

/** Cards in one row share a top edge, a row starts below the row above, and the content fits in each card. */
function checkGrid(p: Probe): void {
	const rows = new Map<number, Card[]>();
	for (const c of p.cards) rows.set(c.top, [...(rows.get(c.top) ?? []), c]);
	const tops = [...rows.keys()].sort((a, b) => a - b);
	expect(tops.length).toBeGreaterThan(0);
	for (let i = 1; i < tops.length; i++) {
		const above = Math.max(...rows.get(tops[i - 1]!)!.map((c) => c.bottom));
		expect(tops[i]!).toBeGreaterThanOrEqual(above);
	}
	const heights = new Set(p.cards.map((c) => c.bottom - c.top));
	expect(heights.size).toBe(1);
	for (const c of p.cards) {
		expect(c.contentBottom).toBeLessThanOrEqual(c.bottom + 1);
		// Each value line fits in the slot that core gives its property.
		for (const l of c.lines) expect(l.h).toBeLessThanOrEqual(l.slot + 1);
	}
}

/** Height of a line box of n lines: the core line box plus (n - 1) wrapped lines. */
function boxOf(core0: number, lh: number, n: number): number {
	return core0 + (n - 1) * lh;
}

describe(`${pluginId} card wrap`, function () {
	let core: Probe;
	/** Core height of the title line box and of a property line box. */
	let t0 = 0;
	let p0 = 0;

	before(async function () {
		await setRule(KEY, null);
		await openBase();
		core = (await probe())!;
		t0 = core.cards[0]!.lines[0]!.h;
		p0 = core.cards[0]!.lines[1]!.h;
	});

	afterEach(async function () {
		// A failed test can leave the rule window open: close it.
		await browser.execute(() => document.querySelectorAll('.modal-container').forEach((el) => el.remove()));
		await setRule(KEY, null);
	});

	it('A0 core look: one line for each property without a rule', async function () {
		expect(core.on).toBe(false);
		for (const c of core.cards) for (const l of c.lines) expect(l.ws).toBe('nowrap');
		checkGrid(core);
	});

	it('A2 clamps the quote to 2 and then 4 lines, and the grid stays aligned', async function () {
		for (const n of [2, 4]) {
			await setRule(KEY, { props: { 'note.quote': { mode: 'clamp', lines: n } }, all: { mode: 'core', lines: 3 } });
			const p = (await probe())!;
			expect(p.on).toBe(true);
			for (const c of p.cards) {
				const q = c.lines[1]!;
				expect(q.ws).toBe('normal');
				expect(Math.abs(q.h - boxOf(p0, q.lh, n))).toBeLessThanOrEqual(1);
				expect(c.lines[2]!.ws).toBe('nowrap');
			}
			checkGrid(p);
			// Each card grows by the extra lines of the shared slot, once for each property after the title.
			const coreH = core.cards[0]!.bottom - core.cards[0]!.top;
			const h = p.cards[0]!.bottom - p.cards[0]!.top;
			const lh = p.cards[0]!.lines[1]!.lh;
			const grow = h - coreH - (ORDER.length - 1) * (n - 1) * lh;
			// Core rounds each measured slot to whole pixels: allow up to 3 px for each slot.
			expect(grow).toBeGreaterThanOrEqual(-(ORDER.length - 1));
			expect(grow).toBeLessThanOrEqual(3 * (ORDER.length - 1));
		}
	});

	it('A1 wrap with 10 lines shows the full long quote', async function () {
		await setRule(KEY, { props: { 'note.quote': { mode: 'wrap', lines: 10 } }, all: { mode: 'core', lines: 3 } });
		const p = (await probe())!;
		const seneca = p.cards.find((c) => c.lines[0]!.text.includes('Seneca'))!;
		expect(seneca).toBeTruthy();
		const q = seneca.lines[1]!;
		expect(q.ws).toBe('normal');
		expect(q.text).toContain('highest achievements if it were all well invested.');
		// The whole value fits in the box: no hidden part.
		expect(q.sh).toBeLessThanOrEqual(q.h + 1);
		checkGrid(p);
	});

	it('A1 wrap with 2 lines scrolls inside the box to the end of the value', async function () {
		await setRule(KEY, { props: {}, all: { mode: 'wrap', lines: 2 } });
		const p = (await probe())!;
		const seneca = p.cards.find((c) => c.lines[0]!.text.includes('Seneca'))!;
		expect(seneca.lines[1]!.sh).toBeGreaterThan(seneca.lines[1]!.h + 1);
		const scrolled = await browser.execute(() => {
			const card = Array.from(document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .bases-cards-item')).find((c) => c.innerText.includes('Seneca'))!;
			const line = card.querySelectorAll<HTMLElement>('.bases-cards-line')[1]!;
			line.scrollTop = 10000;
			return `${getComputedStyle(line).overflowY} ${String(line.scrollTop > 0)}`;
		});
		expect(scrolled).toBe('auto true');
		checkGrid(p);
	});

	it('A3 title on 2 lines, properties on 3 lines and one core property keep one card height per row', async function () {
		await setRule(KEY, { props: { 'file.name': { mode: 'clamp', lines: 2 }, 'note.author': { mode: 'core', lines: 3 } }, all: { mode: 'clamp', lines: 3 } });
		const p = (await probe())!;
		for (const c of p.cards) {
			expect(Math.abs(c.lines[0]!.h - boxOf(t0, c.lines[0]!.lh, 2))).toBeLessThanOrEqual(1);
			expect(Math.abs(c.lines[1]!.h - boxOf(p0, c.lines[1]!.lh, 3))).toBeLessThanOrEqual(1);
			expect(c.lines[2]!.ws).toBe('nowrap');
			expect(c.lines[2]!.h).toBe(p0);
		}
		const marcus = p.cards.find((c) => c.lines[0]!.text.startsWith('Marcus'))!;
		expect(marcus.lines[0]!.sh).toBeGreaterThan(t0 + 2);
		checkGrid(p);
	});

	it('A3 the largest line count sets the shared slot when it is not the first property after the title', async function () {
		await setRule(KEY, { props: { 'note.author': { mode: 'clamp', lines: 4 } }, all: { mode: 'core', lines: 3 } });
		const p = (await probe())!;
		for (const c of p.cards) {
			expect(c.lines[1]!.ws).toBe('nowrap');
			expect(Math.abs(c.lines[2]!.h - boxOf(p0, c.lines[2]!.lh, 4))).toBeLessThanOrEqual(1);
		}
		checkGrid(p);
	});

	it('A8 a date value shows in full with a rule on every property', async function () {
		await setRule(KEY, { props: {}, all: { mode: 'clamp', lines: 2 } });
		const p = (await probe())!;
		for (let i = 0; i < p.cards.length; i++) {
			const before = core.cards[i]!.lines[3]!;
			const after = p.cards[i]!.lines[3]!;
			expect(after.text).toBe(before.text);
			expect(Math.abs(after.textW - before.textW)).toBeLessThanOrEqual(2);
		}
	});

	it('A10 edit after create: clamp 2, then 4, then no rule', async function () {
		await setRule(KEY, { props: { 'note.quote': { mode: 'clamp', lines: 2 } }, all: { mode: 'core', lines: 3 } });
		await setRule(KEY, { props: { 'note.quote': { mode: 'clamp', lines: 4 } }, all: { mode: 'core', lines: 3 } });
		const b = (await probe())!;
		for (const c of b.cards) expect(Math.abs(c.lines[1]!.h - boxOf(p0, c.lines[1]!.lh, 4))).toBeLessThanOrEqual(1);
		await setRule(KEY, null);
		const c = (await probe())!;
		expect(c.on).toBe(false);
		for (const card of c.cards) expect(card.lines[1]!.ws).toBe('nowrap');
		expect(c.cards[0]!.bottom - c.cards[0]!.top).toBe(core.cards[0]!.bottom - core.cards[0]!.top);
	});

	it('A10 the command opens the modal and a change in it applies at once', async function () {
		await openBase();
		await browser.executeObsidianCommand(`${pluginId}:set-view-rule`);
		await browser.waitUntil(async () => (await browser.$$('.bcw-modal .bcw-rule-row').length) === 1 + ORDER.length, { timeout: 5000, timeoutMsg: 'modal rows' });
		const names = await browser.execute(() => Array.from(document.querySelectorAll('.bcw-modal .bcw-rule-row .setting-item-name')).map((e) => (e as HTMLElement).innerText));
		expect(names[0]).toBe('All properties');
		expect(names[1]).toBe('file name (title)');
		expect(names[2]).toBe('Quote');
		await browser.execute(() => {
			const sel = document.querySelectorAll<HTMLElement>('.bcw-modal .bcw-rule-row')[2]!.querySelector('select')!;
			sel.value = 'clamp';
			sel.dispatchEvent(new Event('change'));
		});
		await browser.pause(500);
		const views = await browser.executeObsidian(({ app }, id) => {
			const plugin = (app as unknown as { plugins: { plugins: Record<string, { settings: { views: Record<string, unknown> } }> } }).plugins.plugins[id]!;
			return plugin.settings.views;
		}, pluginId);
		expect(views[KEY]).toEqual({ props: { 'note.quote': { mode: 'clamp', lines: 3 } }, all: { mode: 'core', lines: 3 } });
		const p = (await probe())!;
		expect(Math.abs(p.cards[0]!.lines[1]!.h - boxOf(p0, p.cards[0]!.lines[1]!.lh, 3))).toBeLessThanOrEqual(1);
		await browser.keys('Escape');
	});

	it('A1 wrap with 10 lines set through the modal shows the full long quote', async function () {
		await openBase();
		await browser.executeObsidianCommand(`${pluginId}:set-view-rule`);
		await browser.waitUntil(async () => (await browser.$$('.bcw-modal .bcw-rule-row').length) === 1 + ORDER.length, { timeout: 5000, timeoutMsg: 'modal rows' });
		await browser.execute(() => {
			const sel = document.querySelectorAll<HTMLElement>('.bcw-modal .bcw-rule-row')[2]!.querySelector('select')!;
			sel.value = 'wrap';
			sel.dispatchEvent(new Event('change'));
		});
		// The row draws again with a line count dropdown for the wrap mode.
		await browser.waitUntil(async () => (await browser.execute(() => document.querySelectorAll<HTMLElement>('.bcw-modal .bcw-rule-row')[2]!.querySelectorAll('select:not(.is-measuring)').length)) === 2, { timeout: 5000, timeoutMsg: 'no line count for wrap' }).catch(async (e: unknown) => {
			const html = await browser.execute(() => document.querySelectorAll<HTMLElement>('.bcw-modal .bcw-rule-row')[2]?.outerHTML.slice(0, 600) ?? 'none');
			throw new Error(`${String(e)} ${html}`);
		});
		await browser.execute(() => {
			const sel = document.querySelectorAll<HTMLElement>('.bcw-modal .bcw-rule-row')[2]!.querySelectorAll<HTMLSelectElement>('select:not(.is-measuring)')[1]!;
			sel.value = '10';
			sel.dispatchEvent(new Event('change'));
		});
		await browser.pause(600);
		const views = await browser.executeObsidian(({ app }, id) => {
			const plugin = (app as unknown as { plugins: { plugins: Record<string, { settings: { views: Record<string, unknown> } }> } }).plugins.plugins[id]!;
			return plugin.settings.views;
		}, pluginId);
		expect(views[KEY]).toEqual({ props: { 'note.quote': { mode: 'wrap', lines: 10 } }, all: { mode: 'core', lines: 3 } });
		await browser.keys('Escape');
		const p = (await probe())!;
		const seneca = p.cards.find((c) => c.lines[0]!.text.includes('Seneca'))!;
		const q = seneca.lines[1]!;
		expect(Math.abs(q.h - boxOf(p0, q.lh, 10))).toBeLessThanOrEqual(1);
		expect(q.sh).toBeLessThanOrEqual(q.h + 1);
		checkGrid(p);
	});

	it('A3 guard: when the hidden test card is not found, the view goes back to the core look', async function () {
		await openBase();
		// Force a mismatch: the test card group loses the inline opacity 0 that the slot rule looks for.
		await browser.execute(() => {
			const v = document.querySelector<HTMLElement>('.workspace-leaf.mod-active .bases-view')!;
			const g = Array.from(v.querySelectorAll<HTMLElement>('.bases-cards-group')).find((x) => x.style.opacity === '0')!;
			g.style.opacity = '0.01';
		});
		await setRule(KEY, { props: { 'note.author': { mode: 'clamp', lines: 4 } }, all: { mode: 'core', lines: 3 } });
		await browser.pause(400);
		const p = (await probe())!;
		expect(p.on).toBe(false);
		for (const c of p.cards) for (const l of c.lines) expect(l.ws).toBe('nowrap');
		checkGrid(p);
		await browser.execute(() => {
			const v = document.querySelector<HTMLElement>('.workspace-leaf.mod-active .bases-view')!;
			const g = Array.from(v.querySelectorAll<HTMLElement>('.bases-cards-group')).find((x) => x.style.opacity === '0.01');
			if (g) g.style.opacity = '0';
		});
	});

	it('A3 guard before cards draw: a rule set first, then a base that opens with a mismatch, goes back to the core look', async function () {
		// Open another file first, so the base view opens fresh with the rule already saved.
		await obsidianPage.openFile(`${DIR}/Reading list.md`);
		await setRule(KEY, { props: { 'note.author': { mode: 'clamp', lines: 2 } }, all: { mode: 'core', lines: 3 } });
		// The notice shows once in each session: let it show again for this test.
		await browser.executeObsidian(({ app }, id) => {
			(app as unknown as { plugins: { plugins: Record<string, { noticeShown: boolean }> } }).plugins.plugins[id]!.noticeShown = false;
		}, pluginId);
		// Force a mismatch on the drawn cards only: the author line gets taller than any slot.
		await browser.execute(() => {
			const st = document.createElement('style');
			st.id = 'bcw-force-mismatch';
			st.textContent = '.bases-view.bcw-on .bases-cards-property[data-property="note.author"] > .bases-cards-line { height: 300px !important; }';
			document.head.appendChild(st);
		});
		try {
			await obsidianPage.openFile(BASE);
			await browser.waitUntil(async () => ((await probe())?.cards.length ?? 0) > 0, { timeout: 20000, timeoutMsg: 'no cards' });
			await browser.waitUntil(async () => (await probe())?.on === false && (await lastNoticeText()).includes('Card wrap is paused for Bases Card Wrap/Quotes.base, view "Quotes"'), { timeout: 5000, timeoutMsg: 'guard did not pause the view' });
			const p = (await probe())!;
			for (const c of p.cards) for (const l of c.lines) expect(l.ws).toBe('nowrap');
			checkGrid(p);
			const rows = await settingsText();
			expect(rows).toContain('Paused in this session: the cards did not fit the core layout.');
		} finally {
			await browser.execute(() => document.getElementById('bcw-force-mismatch')?.remove());
		}
	});

	it('A2 rules work when a theme sets --line-height-tight in px', async function () {
		await openBase();
		await browser.execute(() => document.body.style.setProperty('--line-height-tight', '20px'));
		try {
			await setRule(KEY, { props: { 'note.quote': { mode: 'clamp', lines: 3 } }, all: { mode: 'core', lines: 3 } });
			const p = (await probe())!;
			expect(p.on).toBe(true);
			for (const c of p.cards) expect(Math.abs(c.lines[1]!.h - boxOf(p0, 20, 3))).toBeLessThanOrEqual(1);
			checkGrid(p);
		} finally {
			await browser.execute(() => document.body.style.removeProperty('--line-height-tight'));
		}
	});

	it('A9 a view without an order key maps rules by the drawn property ids', async function () {
		await browser.executeObsidian(async ({ app }) => {
			const path = 'Bases Card Wrap/No order.base';
			if (!app.vault.getFileByPath(path)) await app.vault.create(path, 'filters:\n  and:\n    - file.inFolder("Bases Card Wrap/Quotes")\nviews:\n  - type: cards\n    name: Plain\n');
		});
		const key = `${DIR}/No order.base${SEP}Plain`;
		await setRule(key, { props: { 'file.name': { mode: 'clamp', lines: 2 } }, all: { mode: 'core', lines: 3 } });
		await openBase(`${DIR}/No order.base`);
		await browser.waitUntil(async () => (await probe())?.on === true, { timeout: 5000, timeoutMsg: 'no plan for a view without order' });
		const p = (await probe())!;
		for (const c of p.cards) expect(Math.abs(c.lines[0]!.h - boxOf(t0, c.lines[0]!.lh, 2))).toBeLessThanOrEqual(1);
		checkGrid(p);
		await setRule(key, null);
	});

	it('A10 the settings tab lists a new rule at once', async function () {
		await setRule(KEY, { props: {}, all: { mode: 'clamp', lines: 2 } });
		const rows = await browser.executeObsidian(async ({ app }, id) => {
			const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void; close(): void } }).setting;
			setting.open();
			setting.openTabById(id);
			let text = '';
			for (let i = 0; i < 30 && !text.includes('Saved views'); i++) {
				await new Promise((r) => setTimeout(r, 100));
				// The settings can open in their own window: read the tab element, not the main document.
				const tab = (setting as unknown as { activeTab?: { containerEl?: HTMLElement } }).activeTab;
				text = tab?.containerEl?.innerText ?? '';
			}
			setting.close();
			return text;
		}, pluginId);
		expect(rows).toContain('Bases Card Wrap/Quotes.base, view "Quotes"');
		expect(rows).toContain('All properties: 2 lines');
	});

	it('A9 a rule of one view does not change another view of the same base', async function () {
		await setRule(KEY, { props: {}, all: { mode: 'clamp', lines: 3 } });
		await browser.executeObsidian(async ({ app }, path) => {
			const leaf = app.workspace.getLeaf(false);
			await leaf.setViewState({ type: 'bases', state: { file: path, viewName: 'Plain' } });
		}, BASE);
		await browser.waitUntil(async () => (await browser.execute(() => document.querySelector('.workspace-leaf.mod-active .bases-view')?.getAttribute('data-view-name'))) === 'Plain', { timeout: 10000 });
		await browser.pause(400);
		const p = (await probe())!;
		expect(p.on).toBe(false);
	});

	for (const mode of ['source', 'preview'] as const) {
		it(`A4 the embedded base gets the rule of its view in ${mode} mode`, async function () {
			await setRule(KEY, { props: { 'note.quote': { mode: 'clamp', lines: 2 } }, all: { mode: 'core', lines: 3 } });
			await obsidianPage.openFile(`${DIR}/Reading list.md`);
			await browser.executeObsidian(async ({ app }, m) => {
				const leaf = app.workspace.getLeaf(false);
				await leaf.setViewState({ type: 'markdown', state: { file: 'Bases Card Wrap/Reading list.md', mode: m, source: false } });
			}, mode);
			await browser.waitUntil(
				async () => {
					const p = await probe();
					return !!p && p.on && p.cards.length > 0;
				},
				{ timeout: 15000, timeoutMsg: 'embed has no rule or no cards' },
			);
			await browser.pause(300);
			const p = (await probe())!;
			for (const c of p.cards) expect(Math.abs(c.lines[1]!.h - boxOf(p0, c.lines[1]!.lh, 2))).toBeLessThanOrEqual(1);
			checkGrid(p);
			// The base code block has no file: the free rule of Quotes does not reach it.
			const block = await probe(1);
			if (block) expect(block.on).toBe(false);
		});
	}

	it('A7 a renamed base and a renamed view keep the rule', async function () {
		await setRule(KEY, { props: {}, all: { mode: 'clamp', lines: 2 } });
		await browser.executeObsidian(async ({ app }, from) => {
			await app.vault.rename(app.vault.getFileByPath(from)!, 'Bases Card Wrap/Sayings.base');
		}, BASE);
		await browser.waitUntil(async () => (await settingsViews()).includes(`${DIR}/Sayings.base${SEP}Quotes`), { timeout: 5000, timeoutMsg: 'rule did not follow the file' });
		await openBase(`${DIR}/Sayings.base`);
		expect((await probe())!.on).toBe(true);
		await browser.executeObsidian(async ({ app }) => {
			await app.vault.process(app.vault.getFileByPath('Bases Card Wrap/Sayings.base')!, (t) => t.replace('name: Quotes', 'name: Sayings'));
		});
		await browser.waitUntil(async () => (await settingsViews()).includes(`${DIR}/Sayings.base${SEP}Sayings`), { timeout: 5000, timeoutMsg: 'view rule did not move' });
		expect(await settingsViews()).toEqual([`${DIR}/Sayings.base${SEP}Sayings`]);
		// Restore the names for the other tests: the rule comes back to the first key.
		await browser.executeObsidian(async ({ app }) => {
			await app.vault.process(app.vault.getFileByPath('Bases Card Wrap/Sayings.base')!, (t) => t.replace('name: Sayings', 'name: Quotes'));
		});
		await browser.waitUntil(async () => (await settingsViews()).includes(`${DIR}/Sayings.base${SEP}Quotes`), { timeout: 5000, timeoutMsg: 'view rule did not move back' });
		await browser.executeObsidian(async ({ app }) => {
			await app.vault.rename(app.vault.getFileByPath('Bases Card Wrap/Sayings.base')!, 'Bases Card Wrap/Quotes.base');
		});
		await browser.waitUntil(async () => (await settingsViews()).includes(KEY), { timeout: 5000, timeoutMsg: 'rule did not come back' });
	});

	it('A6 disabling the plugin restores the core look and card height', async function () {
		await setRule(KEY, { props: {}, all: { mode: 'clamp', lines: 3 } });
		await openBase();
		expect((await probe())!.on).toBe(true);
		await browser.executeObsidian(async ({ app }, id) => {
			await (app as unknown as { plugins: { disablePlugin(id: string): Promise<void> } }).plugins.disablePlugin(id);
		}, pluginId);
		await browser.pause(600);
		const p = (await probe())!;
		expect(p.on).toBe(false);
		expect(p.cards[0]!.bottom - p.cards[0]!.top).toBe(core.cards[0]!.bottom - core.cards[0]!.top);
		for (const c of p.cards) for (const l of c.lines) expect(l.ws).toBe('nowrap');
		checkGrid(p);
		await browser.executeObsidian(async ({ app }, id) => {
			await (app as unknown as { plugins: { enablePlugin(id: string): Promise<boolean> } }).plugins.enablePlugin(id);
		}, pluginId);
		// The saved rule comes back after enable.
		await browser.waitUntil(async () => (await probe())?.on === true, { timeout: 5000, timeoutMsg: 'rule not back after enable' });
	});

	it('A5 1,000 notes: the view draws, scrolls without long frames, keeps the grid and the scroll position', async function () {
		this.timeout(240_000);
		await browser.executeObsidian(async ({ app }) => {
			const folder = 'Bases Card Wrap/Many';
			if (!app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
			for (let i = 0; i < 1000; i++) {
				const p = `${folder}/Item ${String(i).padStart(4, '0')}.md`;
				if (!app.vault.getFileByPath(p)) await app.vault.create(p, `---\nquote: "Item ${i} has a long value that runs past the width of one card, so it needs more than one line to read in full."\nauthor: Gen\n---\n`);
			}
			const base = 'Bases Card Wrap/Many.base';
			if (!app.vault.getFileByPath(base)) await app.vault.create(base, 'filters:\n  and:\n    - file.inFolder("Bases Card Wrap/Many")\nviews:\n  - type: cards\n    name: Many\n    order:\n      - file.name\n      - quote\n      - author\n');
		});
		const many = `${DIR}/Many.base${SEP}Many`;
		await setRule(many, { props: { 'note.quote': { mode: 'clamp', lines: 3 } }, all: { mode: 'core', lines: 3 } });
		await openBase(`${DIR}/Many.base`);
		const result = await browser.executeAsync((done: (r: { maxGap: number; total: number; scrolled: number; height: number }) => void) => {
			const v = Array.from(document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .bases-view')).find((x) => x.offsetParent !== null)!;
			let last = performance.now();
			let maxGap = 0;
			const start = last;
			let step = 0;
			const tick = (): void => {
				const now = performance.now();
				maxGap = Math.max(maxGap, now - last);
				last = now;
				if (step++ < 60) {
					v.scrollTop += 900;
					requestAnimationFrame(tick);
				} else done({ maxGap: Math.round(maxGap), total: Math.round(now - start), scrolled: Math.round(v.scrollTop), height: v.scrollHeight });
			};
			requestAnimationFrame(tick);
		});
		console.log(`A5 1000 notes: ${JSON.stringify(result)}`);
		expect(result.scrolled).toBeGreaterThan(20000);
		expect(result.maxGap).toBeLessThan(500);
		await browser.pause(300);
		const p = (await probe())!;
		expect(p.on).toBe(true);
		for (const c of p.cards) expect(Math.abs(c.lines[1]!.h - boxOf(p0, c.lines[1]!.lh, 3))).toBeLessThanOrEqual(1);
		checkGrid(p);
		// Edit the rule while scrolled: the scroll position does not jump to the top.
		await browser.execute(() => {
			const v = Array.from(document.querySelectorAll<HTMLElement>('.workspace-leaf.mod-active .bases-view')).find((x) => x.offsetParent !== null)!;
			v.scrollTop = 6000;
		});
		await browser.pause(300);
		await setRule(many, { props: { 'note.quote': { mode: 'clamp', lines: 4 } }, all: { mode: 'core', lines: 3 } });
		const q = (await probe())!;
		expect(q.scrollTop).toBeGreaterThan(5000);
		checkGrid(q);
		await setRule(many, null);
	});
});

import { afterEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import * as main from '../src/main';
import manifest from '../manifest.json';

const BasesCardWrapPlugin = main.default;

/** A ResizeObserver stand-in that records its targets. */
class FakeResizeObserver {
	static all: FakeResizeObserver[] = [];
	targets = new Set<Element>();
	disconnected = false;
	constructor(readonly cb: unknown) {
		FakeResizeObserver.all.push(this);
	}
	observe(el: Element): void {
		this.targets.add(el);
	}
	unobserve(el: Element): void {
		this.targets.delete(el);
	}
	disconnect(): void {
		this.disconnected = true;
		this.targets.clear();
	}
}

type Internals = {
	touched: Set<HTMLElement>;
	widths: WeakMap<HTMLElement, number>;
	resizeObservers: Map<Window, FakeResizeObserver>;
	watchWidth(el: HTMLElement): void;
	scan(): void;
	closeWindow(win: Window): void;
};

const saved = (window as unknown as { ResizeObserver: unknown }).ResizeObserver;
afterEach(() => {
	(window as unknown as { ResizeObserver: unknown }).ResizeObserver = saved;
	FakeResizeObserver.all = [];
	document.body.empty();
});

async function setup() {
	(window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
	const app = App.createConfigured__({ files: { 'notes/a.md': '# A' } });
	const plugin = new BasesCardWrapPlugin(app as never, manifest as never);
	await plugin.loadSettings();
	return plugin as unknown as Internals;
}

describe('width watch of styled views', () => {
	it('a scan stops the width watch of a view that is no longer in the page', async () => {
		const p = await setup();
		const view = document.body.createDiv({ cls: 'bases-view' });
		p.touched.add(view);
		p.watchWidth(view);
		p.widths.set(view, 200);
		const ro = p.resizeObservers.get(window)!;
		expect(ro.targets.has(view)).toBe(true);
		view.remove();
		p.scan();
		expect(p.touched.has(view)).toBe(false);
		expect(ro.targets.has(view)).toBe(false);
		expect(p.widths.has(view)).toBe(false);
	});

	it('a closed window gives no observer that stays in the map', async () => {
		const p = await setup();
		const view = document.body.createDiv({ cls: 'bases-view' });
		p.watchWidth(view);
		const ro = p.resizeObservers.get(window)!;
		p.closeWindow(window);
		expect(ro.disconnected).toBe(true);
		expect(p.resizeObservers.has(window)).toBe(false);
	});
});

describe('resetScrollbars', () => {
	it('forces one layout in each document, so that a view in a popout window is reset too', () => {
		const other = document.implementation.createHTMLDocument('popout');
		const reads: string[] = [];
		const make = (doc: Document, name: string): HTMLElement => {
			const el = doc.createElement('div');
			doc.body.appendChild(el);
			Object.defineProperty(el, 'offsetHeight', { get: () => (reads.push(name), 100) });
			return el;
		};
		const a = make(document, 'main');
		const b = make(document, 'main-2');
		const c = make(other, 'popout');
		main.resetScrollbars([a, b, c]);
		expect(reads).toEqual(['main', 'popout']);
		for (const el of [a, b, c]) expect(el.classList.contains('bcw-relayout')).toBe(false);
	});
});

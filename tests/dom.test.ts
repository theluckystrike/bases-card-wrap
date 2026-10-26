// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { cardsFit, domOrder } from '../src/main';

function view(html: string): HTMLElement {
	const el = document.createElement('div');
	el.className = 'bases-view';
	el.innerHTML = html;
	document.body.appendChild(el);
	return el;
}

const tester = '<div class="bases-cards-group" style="opacity: 0"><div class="bases-cards-item"><div class="bases-cards-cover"></div><div class="bases-cards-property mod-title"><div class="bases-cards-line">Fj</div></div><div class="bases-cards-property"><div class="bases-cards-line">Fj</div></div></div></div>';

describe('domOrder', () => {
	it('reads data-property of the first drawn card, not of the hidden test card', () => {
		const v = view(`${tester}<div class="bases-cards-group"><div class="bases-cards-item"><div class="bases-cards-property mod-title" data-property="file.name"></div><div class="bases-cards-property" data-property="note.quote"></div></div></div>`);
		expect(domOrder(v)).toEqual(['file.name', 'note.quote']);
	});
	it('gives null when no card is drawn or an id is missing', () => {
		expect(domOrder(view(tester))).toBeNull();
		expect(domOrder(view('<div class="bases-cards-group"><div class="bases-cards-item"><div class="bases-cards-property"></div></div></div>'))).toBeNull();
	});
});

describe('cardsFit', () => {
	it('is false when a line is more than 2 px taller than its slot (forced mismatch)', () => {
		const v = view('<div class="bases-cards-group"><div class="bases-cards-item"><div class="bases-cards-property" data-property="note.quote"><div class="bases-cards-label"></div><div class="bases-cards-line"></div></div></div></div>');
		const prop = v.querySelector<HTMLElement>('.bases-cards-property')!;
		const line = v.querySelector<HTMLElement>('.bases-cards-line')!;
		const label = v.querySelector<HTMLElement>('.bases-cards-label')!;
		Object.defineProperty(prop, 'clientHeight', { value: 40 });
		Object.defineProperty(label, 'offsetHeight', { value: 16 });
		Object.defineProperty(line, 'offsetHeight', { value: 26, configurable: true });
		expect(cardsFit(v)).toBe(true);
		Object.defineProperty(line, 'offsetHeight', { value: 75 });
		expect(cardsFit(v)).toBe(false);
	});
	it('is true when no card is drawn', () => {
		expect(cardsFit(view(tester))).toBe(true);
	});
});

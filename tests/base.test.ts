import { describe, expect, it } from 'vitest';
import { parseBase } from '../src/main';

describe('parseBase', () => {
	it('reads view names, orders and display names', () => {
		const text = 'properties:\n  note.quote:\n    displayName: Quote\n  author:\n    displayName: Who\nviews:\n  - type: cards\n    name: Quotes\n    order:\n      - file.name\n      - quote\n  - type: table\n    name: T\n';
		expect(parseBase(text)).toEqual({ views: [{ name: 'Quotes', order: ['file.name', 'quote'] }, { name: 'T', order: null }], labels: { 'note.quote': 'Quote', 'note.author': 'Who' } });
	});
	it('gives empty info for empty text and skips bad views', () => {
		expect(parseBase('')).toEqual({ views: [], labels: {} });
		expect(parseBase('views:\n  - 5\n  - name: 7\n    order: [a, 3]\n')).toEqual({ views: [{ name: '', order: ['a'] }], labels: {} });
	});
});

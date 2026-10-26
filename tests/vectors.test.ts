import { describe, expect, it } from 'vitest';
import vectors from './vectors/bases-card-wrap.json';
import { clampLines, describeRule, effectiveRule, embedLinkPath, embedViewName, isEmptyRule, isPlanClass, normalizeRule, normalizeViewRule, propId, propRule, renameKeys, renameView, splitKey, viewKey, viewPlan } from '../src/rules';

const fns: Record<string, (...args: never[]) => unknown> = { clampLines, describeRule, effectiveRule, embedLinkPath, embedViewName, isEmptyRule, normalizeRule, normalizeViewRule, propRule, renameKeys, renameView, splitKey, viewKey, viewPlan, propId, isPlanClass };

describe('golden vectors (packages/spec/vectors/bases-card-wrap.json)', () => {
	it('covers the acceptance groups', () => {
		for (const n of ['1', '2', '3', '4', '6', '7', '9']) expect(vectors.cases.some((c) => c.name.startsWith(`${n} `))).toBe(true);
		expect(vectors.cases.length).toBeGreaterThanOrEqual(30);
	});
	for (const c of vectors.cases) {
		it(c.name, () => {
			const fn = fns[c.fn];
			expect(fn).toBeTypeOf('function');
			expect(fn!(...(c.args as never[]))).toEqual(c.expected);
		});
	}
});

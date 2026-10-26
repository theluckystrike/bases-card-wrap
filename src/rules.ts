// Pure rule logic for Bases Card Wrap. No Obsidian imports: the golden vectors in
// packages/spec/vectors/bases-card-wrap.json test these functions directly.

/** How one property shows on a card. "core" keeps the Obsidian look (one line, cut off). */
export type WrapMode = 'core' | 'wrap' | 'clamp';

export interface PropRule {
	mode: WrapMode;
	/** Line count for "clamp". Always 1 to MAX_LINES. */
	lines: number;
}

/** The rules of one view of one base. */
export interface ViewRule {
	/** Rule for each property id, such as "note.quote" or "file.name". */
	props: Record<string, PropRule>;
	/** Rule for each property that has no rule in props. */
	all: PropRule;
}

export const MIN_LINES = 1;
export const MAX_LINES = 10;
export const DEFAULT_LINES = 3;
export const CORE: PropRule = { mode: 'core', lines: DEFAULT_LINES };
/** Separator between the base path and the view name in a view key. A file path cannot hold it. */
export const KEY_SEP = '\u0000';

/** Gives an integer line count from 1 to 10. Bad input gives the default (3). */
export function clampLines(n: unknown): number {
	const v = typeof n === 'number' ? n : typeof n === 'string' && n.trim() !== '' ? Number(n) : NaN;
	if (!Number.isFinite(v)) return DEFAULT_LINES;
	return Math.min(MAX_LINES, Math.max(MIN_LINES, Math.round(v)));
}

/** Makes a valid rule from saved data. Unknown modes give "core". */
export function normalizeRule(raw: unknown): PropRule {
	if (!raw || typeof raw !== 'object') return { ...CORE };
	const r = raw as Record<string, unknown>;
	const mode: WrapMode = r.mode === 'wrap' || r.mode === 'clamp' ? r.mode : 'core';
	return { mode, lines: clampLines(r.lines) };
}

/** Makes a valid view rule from saved data. Property rules in "core" mode are dropped when all is core too. */
export function normalizeViewRule(raw: unknown): ViewRule {
	const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const props: Record<string, PropRule> = {};
	if (r.props && typeof r.props === 'object') {
		for (const [k, v] of Object.entries(r.props as Record<string, unknown>)) {
			if (typeof k !== 'string' || k === '') continue;
			props[k] = normalizeRule(v);
		}
	}
	return { props, all: normalizeRule(r.all) };
}

/** True when the view rule changes nothing. */
export function isEmptyRule(rule: ViewRule): boolean {
	return rule.all.mode === 'core' && Object.values(rule.props).every((p) => p.mode === 'core');
}

/** The settings key of one view of one base file. */
export function viewKey(basePath: string, viewName: string): string {
	return `${basePath}${KEY_SEP}${viewName}`;
}

/** Splits a view key into the base path and the view name. Null for a bad key. */
export function splitKey(key: string): { basePath: string; viewName: string } | null {
	const i = key.indexOf(KEY_SEP);
	if (i <= 0) return null;
	return { basePath: key.slice(0, i), viewName: key.slice(i + 1) };
}

/**
 * Moves the keys of a renamed or moved base file, or of each base file in a renamed folder.
 * Gives a new object. Returns the input object when no key changes.
 * When the new key already has a rule, the moved rule replaces it (the user renamed this file onto that name).
 */
export function renameKeys<T>(views: Record<string, T>, oldPath: string, newPath: string): Record<string, T> {
	if (oldPath === newPath) return views;
	let changed = false;
	const out: Record<string, T> = {};
	const moved: Record<string, T> = {};
	for (const [key, value] of Object.entries(views)) {
		const parts = splitKey(key);
		let target = key;
		if (parts) {
			if (parts.basePath === oldPath) target = viewKey(newPath, parts.viewName);
			else if (parts.basePath.startsWith(`${oldPath}/`)) target = viewKey(newPath + parts.basePath.slice(oldPath.length), parts.viewName);
		}
		if (target !== key) {
			changed = true;
			moved[target] = value;
		} else out[key] = value;
	}
	if (!changed) return views;
	return { ...out, ...moved };
}

/** Moves the rule of a renamed view inside one base. Gives the input when the old view has no rule. */
export function renameView<T>(views: Record<string, T>, basePath: string, oldName: string, newName: string): Record<string, T> {
	const from = viewKey(basePath, oldName);
	if (oldName === newName || !(from in views)) return views;
	const out: Record<string, T> = {};
	for (const [k, v] of Object.entries(views)) if (k !== from) out[k] = v;
	out[viewKey(basePath, newName)] = views[from] as T;
	return out;
}

/** The rule of one property in a view rule: its own rule, else the "all properties" rule. */
export function propRule(rule: ViewRule | null | undefined, prop: string): PropRule {
	if (!rule) return CORE;
	return rule.props[prop] ?? rule.all;
}

/**
 * The rule that applies to one view. The view's own rule comes first. Without one, Pro uses the vault default.
 * basePath is null for a base code block: only the vault default (Pro) applies there.
 */
export function effectiveRule(views: Record<string, ViewRule>, vaultDefault: ViewRule | null, basePath: string | null, viewName: string, pro: boolean): ViewRule | null {
	if (basePath !== null) {
		const own = views[viewKey(basePath, viewName)];
		if (own && !isEmptyRule(own)) return own;
	}
	if (pro && vaultDefault && !isEmptyRule(vaultDefault)) return vaultDefault;
	return null;
}

/** Highest property position that styles.css styles: the title is position 1, so 39 more properties fit. */
export const MAX_POS = 40;

export interface ViewPlan {
	/** Classes for the .bases-view element. */
	classes: string[];
	/** CSS variables for the .bases-view element. */
	vars: Record<string, string>;
}

/**
 * Normalizes a property id from a .base file order list. "quote" becomes "note.quote".
 * Ids with the prefix note., file. or formula. stay as they are.
 */
export function propId(raw: string): string {
	return /^(note|file|formula)\./.test(raw) ? raw : `note.${raw}`;
}

/**
 * The classes and CSS variables for one cards view.
 * Core gives each card one fixed height and puts each property in a slot with a fixed top and height. The title slot
 * and one shared slot for all other properties get their height from a hidden test card. So the title gets its own
 * line count, and each other property gets the slot of the largest line count after the title (--bcw-slot).
 * A property with fewer lines than the slot shows its lines at the top of the slot.
 * Position K is the K-th property of a card (1 is the title). order is the property order of the view, or null when
 * it is not known: then each position uses the "all properties" rule.
 */
export function viewPlan(rule: ViewRule | null, order: string[] | null): ViewPlan | null {
	if (!rule || isEmptyRule(rule)) return null;
	const count = order ? Math.min(order.length, MAX_POS) : MAX_POS;
	if (count === 0) return null;
	const classes = ['bcw-on'];
	const vars: Record<string, string> = {};
	let slot = 1;
	for (let i = 0; i < count; i++) {
		const pos = i + 1;
		const r = order ? propRule(rule, propId(order[i]!)) : rule.all;
		if (r.mode === 'core') {
			classes.push(`bcw-k-${pos}`);
			continue;
		}
		const lines = clampLines(r.lines);
		classes.push(`${r.mode === 'clamp' ? 'bcw-c' : 'bcw-s'}-${pos}`);
		vars[`--bcw-n-${pos}`] = String(lines);
		if (i > 0) slot = Math.max(slot, lines);
	}
	vars['--bcw-slot'] = String(slot);
	return { classes, vars };
}

/** True when the class is one that viewPlan can give. */
export function isPlanClass(cls: string): boolean {
	return cls === 'bcw-on' || /^bcw-[cks]-\d+$/.test(cls);
}

/**
 * Reads the view name from the subpath of a base embed, such as "#Quotes" in ![[Quotes.base#Quotes]].
 * Gives null when the link has no view name.
 */
export function embedViewName(src: string): string | null {
	const i = src.indexOf('#');
	if (i < 0) return null;
	const name = src.slice(i + 1).trim();
	return name === '' ? null : name;
}

/** The link path of a base embed without its subpath. */
export function embedLinkPath(src: string): string {
	const i = src.indexOf('#');
	return (i < 0 ? src : src.slice(0, i)).trim();
}

/** One line that describes a rule, for the settings list. */
export function describeRule(rule: ViewRule, label: (prop: string) => string = (p) => p): string {
	const n = (r: PropRule): string => `${r.lines} ${r.lines === 1 ? 'line' : 'lines'}`;
	const one = (r: PropRule): string => (r.mode === 'wrap' ? `${n(r)}, scroll` : r.mode === 'clamp' ? n(r) : 'one line');
	const parts: string[] = [];
	if (rule.all.mode !== 'core') parts.push(`All properties: ${one(rule.all)}`);
	for (const [k, v] of Object.entries(rule.props).sort(([a], [b]) => a.localeCompare(b))) {
		if (v.mode === rule.all.mode && v.lines === rule.all.lines) continue;
		parts.push(`${label(k)}: ${one(v)}`);
	}
	return parts.length ? parts.join(', ') : 'No change';
}

/**
 * The guard step of one view. "ok" when the drawn cards fit their core slots. "wait" when they do not fit and the
 * first miss of this view is less than waitMs ago (core can measure again, for example after styles.css loads), or
 * when this is the first miss (firstMiss null). "pause" when they still do not fit waitMs after the first miss.
 */
export function guardStep(fits: boolean, firstMiss: number | null, now: number, waitMs: number): 'ok' | 'wait' | 'pause' {
	if (fits) return 'ok';
	if (firstMiss === null) return 'wait';
	return now - firstMiss < waitMs ? 'wait' : 'pause';
}

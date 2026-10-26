import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { helloSettingItems } from './hello/settings';
import { PRO_UI, isPro } from './pro';
import { describeRule, isEmptyRule, normalizeViewRule, splitKey, type ViewRule } from './rules';
import type BasesCardWrapPlugin from './main';

export interface BasesCardWrapSettings {
	/** Rules for each view of each base file. Key: viewKey(basePath, viewName). */
	views: Record<string, ViewRule>;
	/** Pro: the rule of each cards view that has no rule of its own. Null when not set. */
	vaultDefault: ViewRule | null;
}

export const DEFAULT_SETTINGS: BasesCardWrapSettings = {
	views: {},
	vaultDefault: null,
};

/** Fills gaps and drops bad values from saved data, so old or hand-edited data.json never breaks the plugin. */
export function normalizeSettings(saved: Partial<BasesCardWrapSettings> | null | undefined): BasesCardWrapSettings {
	const s = saved ?? {};
	const views: Record<string, ViewRule> = {};
	if (s.views && typeof s.views === 'object') {
		for (const [k, v] of Object.entries(s.views)) {
			if (!splitKey(k)) continue;
			const rule = normalizeViewRule(v);
			if (!isEmptyRule(rule)) views[k] = rule;
		}
	}
	const def = s.vaultDefault ? normalizeViewRule(s.vaultDefault) : null;
	return { views, vaultDefault: def && !isEmptyRule(def) ? def : null };
}

export class BasesCardWrapSettingTab extends PluginSettingTab {
	plugin: BasesCardWrapPlugin;

	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: BasesCardWrapPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		const keys = Object.keys(this.plugin.settings.views).sort((a, b) => a.localeCompare(b));
		const items: SettingDefinitionItem[] = [
			{
				name: 'How to set a rule',
				desc: 'Open a base in cards view. Run the command "Set card wrap for this view". Each view of each base keeps its own rule.',
			},
			{
				type: 'list',
				heading: 'Saved views',
				emptyState: 'No view has a rule yet.',
				onDelete: (index: number) => {
					const key = keys[index];
					if (key === undefined) return;
					void this.plugin.setViewRule(key, null).then(() => this.update());
				},
				items: keys.map((key) => {
					const parts = splitKey(key)!;
					return {
						name: `${parts.basePath}, view "${parts.viewName}"`,
						desc: (this.plugin.paused.has(key) ? 'Paused in this session: the cards did not fit the core layout. ' : '') + describeRule(this.plugin.settings.views[key]!, (p) => this.plugin.propLabel(p)),
						action: () => this.plugin.openRuleModal(parts.basePath, parts.viewName),
					};
				}),
			},
			{
				name: 'Vault default',
				desc: isPro()
					? `Pro. The rule of each cards view that has no rule of its own, also in base code blocks. Now: ${this.plugin.settings.vaultDefault ? describeRule(this.plugin.settings.vaultDefault) : 'not set'}.`
					: 'Pro. A rule for each cards view that has no rule of its own, also in base code blocks. The free version sets a rule for each view.',
				action: () => this.plugin.openDefaultModal(),
				disabled: () => !isPro(),
			},
			// The Pro group comes after the settings of the plugin.
			...(this.plugin.pro ? sponsorsSettingItems(this.plugin.pro, PRO_UI) : []),
		];
		return items;
	}
}


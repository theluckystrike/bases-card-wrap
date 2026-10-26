import { Modal, Setting, type App } from 'obsidian';
import { CORE, MAX_LINES, MIN_LINES, clampLines, normalizeViewRule, type PropRule, type ViewRule, type WrapMode } from './rules';

const MODES: Record<WrapMode, string> = {
	core: 'One line (Obsidian default)',
	wrap: 'Wrap, show the full value',
	clamp: 'Wrap up to a number of lines',
};

export interface RuleModalOptions {
	title: string;
	/** Property ids in card order, such as "file.name" and "note.quote". */
	props: string[];
	label: (prop: string) => string;
	initial: ViewRule | null;
	/** Called after each change, with the full rule. The cards follow at once. */
	onChange: (rule: ViewRule) => Promise<void>;
}

/** Edits the rule of one view: one row for all properties, then one row for each property of the view. */
export class RuleModal extends Modal {
	private rule: ViewRule;

	constructor(
		app: App,
		private readonly opts: RuleModalOptions,
	) {
		super(app);
		this.rule = normalizeViewRule(opts.initial ?? { props: {}, all: CORE });
		this.modalEl.addClass('bcw-modal');
	}

	onOpen(): void {
		this.setTitle(this.opts.title);
		this.draw();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private draw(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: 'Choose how each property shows on the cards of this view. The change shows at once. Obsidian gives the properties after the title one shared height, so each of them gets the space of the largest line count.', cls: 'setting-item-description' });
		this.row(contentEl, 'All properties', 'For each property that has no row of its own below.', this.rule.all, false, (r) => {
			this.rule = { ...this.rule, all: r ?? CORE };
		});
		for (const prop of this.opts.props) {
			const own = this.rule.props[prop];
			this.row(contentEl, this.opts.label(prop), own ? '' : 'Uses the "All properties" row.', own ?? null, true, (r) => {
				const props = { ...this.rule.props };
				if (r === null) delete props[prop];
				else props[prop] = r;
				this.rule = { ...this.rule, props };
			});
		}
	}

	/** One row: a mode dropdown and, for clamp and wrap, a line count. A property row has the extra choice "Same as all properties". */
	private row(parent: HTMLElement, name: string, desc: string, value: PropRule | null, inherit: boolean, set: (r: PropRule | null) => void): void {
		const setting = new Setting(parent).setName(name);
		if (desc) setting.setDesc(desc);
		setting.settingEl.addClass('bcw-rule-row');
		setting.addDropdown((dd) => {
			if (inherit) dd.addOption('inherit', 'Same as all properties');
			for (const [k, v] of Object.entries(MODES)) dd.addOption(k, v);
			dd.setValue(value ? value.mode : 'inherit');
			dd.onChange((v) => {
				if (v === 'inherit') set(null);
				else set({ mode: v as WrapMode, lines: value?.lines ?? 3 });
				void this.commit();
			});
		});
		if (value && value.mode !== 'core') {
			const mode = value.mode;
			setting.addDropdown((dd) => {
				for (let n = MIN_LINES; n <= MAX_LINES; n++) dd.addOption(String(n), `${n} ${n === 1 ? 'line' : 'lines'}`);
				dd.setValue(String(clampLines(value.lines)));
				dd.onChange((v) => {
					set({ mode, lines: clampLines(v) });
					void this.commit();
				});
			});
		}
	}

	private async commit(): Promise<void> {
		try {
			await this.opts.onChange(this.rule);
		} finally {
			// Draw the rows again even when the save fails, so the line count shows for the new mode.
			this.draw();
		}
	}
}

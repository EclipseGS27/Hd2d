import { DEFAULTS, MODULE_ID, PRESETS, SLIDERS } from './look.mjs';

const { ApplicationV2 } = foundry.applications.api;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * The HD-2D panel: on/off, Auto-tune with what it read from the scene, presets, and a slider for every part of
 * the look. Changes show on the canvas as you drag and are kept for you; the GM can also save them as the
 * scene's own look, or turn the look off for a scene.
 */
export class HD2DConfig extends ApplicationV2 {
	static DEFAULT_OPTIONS = {
		id: 'fu-hd2d-config',
		classes: ['hd2d-app'],
		window: { title: 'HD-2D Look', icon: 'fa-solid fa-mountain-sun', resizable: true },
		position: { width: 460, height: 720 },
	};

	constructor(engine, options = {}) {
		super(options);
		this.engine = engine;
		this.cfg = { ...DEFAULTS, ...(game.settings.get(MODULE_ID, 'config') ?? {}) };
		this._onAnalyzed = () => this.rendered && this.#refreshReadout();
		Hooks.on('hd2dAnalyzed', this._onAnalyzed);
	}

	static open(engine) {
		const app = foundry.applications.instances.get('fu-hd2d-config') ?? new HD2DConfig(engine);
		return app.render({ force: true });
	}

	#readout() {
		const a = this.engine.analysis;
		if (!a) return '<span class="dim">No scene read yet.</span>';
		const sw = (c) => `<i style="background:rgb(${c.map((v) => Math.round(v * 255)).join(',')})"></i>`;
		return `<b>${esc(a.words.join(', '))}</b><span class="sw" data-tooltip="Shadows, highlights, light">${sw(a.tune.shadowTint)}${sw(a.tune.highTint)}${sw(a.tune.rayColor)}</span><span class="dim">${esc(a.tune.moteKind)}</span>`;
	}

	#refreshReadout() {
		const el = this.element?.querySelector('.readout .val');
		if (el) el.innerHTML = this.#readout();
	}

	async _renderHTML() {
		const c = this.cfg;
		const groups = {};
		for (const s of SLIDERS) (groups[s[5]] ??= []).push(s);
		const gm = game.user.isGM;
		const sceneLook = canvas?.scene?.getFlag(MODULE_ID, 'look');
		const sceneOff = canvas?.scene?.getFlag(MODULE_ID, 'off');
		const div = document.createElement('div');
		div.className = 'hd2d';
		div.innerHTML = `
			<div class="top">
				<label class="switch"><input type="checkbox" data-b="enabled" ${c.enabled ? 'checked' : ''}><span></span><b>HD-2D look</b></label>
				<label class="switch sm" data-tooltip="Tune the look to this scene's colors and light"><input type="checkbox" data-b="auto" ${c.auto ? 'checked' : ''}><span></span>Auto-tune</label>
			</div>
			<div class="readout"><small>This scene</small><span class="val">${this.#readout()}</span><button type="button" data-act="analyze" data-tooltip="Read the scene again"><i class="fa-solid fa-rotate"></i></button></div>
			${sceneLook && game.settings.get(MODULE_ID, 'useSceneLooks') ? '<p class="note">This scene has its own look from the GM; your sliders apply in other scenes.</p>' : ''}
			${sceneOff ? '<p class="note">The GM turned the look off for this scene.</p>' : ''}
			<div class="row">
				<label class="fld"><span>Preset</span><select data-act="preset"><option value="">Apply a preset…</option>${Object.entries(PRESETS)
					.map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`)
					.join('')}</select></label>
				<label class="fld"><span>Quality</span><select data-s="quality">${[['low', 'Fast'], ['high', 'High'], ['ultra', 'Ultra']].map(([v, l]) => `<option value="${v}" ${c.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
			</div>
			<div class="row">
				<label class="fld"><span>Focus follows</span><select data-s="focusFollow">${[['token', 'Your token'], ['combatant', 'Whoever is acting'], ['screen', 'Middle of the screen']].map(([v, l]) => `<option value="${v}" ${c.focusFollow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
				<label class="fld"><span>Crisp pixels</span><select data-s="crisp">${[['small', 'Small sprites'], ['all', 'Every token'], ['off', 'Off']].map(([v, l]) => `<option value="${v}" ${c.crisp === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
			</div>
			<div class="sliders">
				${Object.entries(groups)
					.map(
						([g, list]) => `<fieldset><legend>${esc(g)}</legend>${list
							.map(
								([k, label, min, max, step, , hint]) => `<label class="sl" ${hint ? `data-tooltip="${esc(hint)}"` : ''}><span>${esc(label)}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${c[k]}"><output>${Number(c[k]).toFixed(2)}</output></label>`,
							)
							.join('')}</fieldset>`,
					)
					.join('')}
			</div>
			<footer>
				<button type="button" data-act="reset">Reset</button>
				${gm ? `<span class="sp"></span><button type="button" data-act="sceneSave" data-tooltip="Everyone sees these values in this scene">Save for this scene</button>${sceneLook ? '<button type="button" data-act="sceneClear" data-tooltip="Remove this scene\'s own look">Clear scene look</button>' : ''}<button type="button" data-act="sceneOff">${sceneOff ? 'Turn on for this scene' : 'Off for this scene'}</button>` : ''}
			</footer>`;
		return div;
	}

	_replaceHTML(result, content) {
		const top = content.querySelector('.sliders')?.scrollTop ?? 0;
		content.replaceChildren(result);
		const sl = content.querySelector('.sliders');
		if (sl) sl.scrollTop = top;
	}

	_onRender() {
		const root = this.element;
		root.querySelectorAll('input[type="range"][data-k]').forEach((el) =>
			el.addEventListener('input', () => {
				this.cfg[el.dataset.k] = Number(el.value);
				el.nextElementSibling.textContent = Number(el.value).toFixed(2);
				this.#live();
			}),
		);
		root.querySelectorAll('[data-b]').forEach((el) =>
			el.addEventListener('change', () => {
				this.cfg[el.dataset.b] = el.checked;
				this.#live(true);
			}),
		);
		root.querySelectorAll('select[data-s]').forEach((el) =>
			el.addEventListener('change', () => {
				this.cfg[el.dataset.s] = el.value;
				this.#live(true);
			}),
		);
		root.querySelectorAll('[data-act]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'click', () => this.#act(el.dataset.act, el)));
	}

	/** Show the change at once; keep it a moment later */
	#live(structural = false) {
		this.engine.preview = { ...this.cfg };
		if (structural) this.engine.refresh();
		else this.engine.update();
		clearTimeout(this._save);
		this._save = setTimeout(async () => {
			await game.settings.set(MODULE_ID, 'config', { ...this.cfg });
			this.engine.preview = null;
			this.engine.refresh();
		}, 400);
	}

	async #act(act, el) {
		const scene = canvas?.scene;
		switch (act) {
			case 'analyze':
				return this.engine.refresh({ reanalyze: true });
			case 'preset': {
				const p = PRESETS[el.value];
				if (!p) return;
				Object.assign(this.cfg, Object.fromEntries(Object.entries(DEFAULTS).filter(([k]) => SLIDERS.some((s) => s[0] === k))), p.values);
				this.#live();
				return this.render();
			}
			case 'reset':
				this.cfg = { ...DEFAULTS };
				this.#live(true);
				return this.render();
			case 'sceneSave': {
				const look = Object.fromEntries(Object.entries(this.cfg).filter(([k]) => SLIDERS.some((s) => s[0] === k) || ['auto', 'focusFollow', 'crisp'].includes(k)));
				await scene?.setFlag(MODULE_ID, 'look', look);
				ui.notifications.info('Saved as this scene’s look.');
				return this.render();
			}
			case 'sceneClear':
				await scene?.unsetFlag(MODULE_ID, 'look');
				return this.render();
			case 'sceneOff':
				if (scene?.getFlag(MODULE_ID, 'off')) await scene.unsetFlag(MODULE_ID, 'off');
				else await scene?.setFlag(MODULE_ID, 'off', true);
				return this.render();
		}
	}

	_onClose(options) {
		Hooks.off('hd2dAnalyzed', this._onAnalyzed);
		return super._onClose?.(options);
	}
}

import { Engine } from './engine.mjs';
import { HD2DConfig } from './config.mjs';
import { DEFAULTS, MODULE_ID, PRESETS, analyzeScene } from './look.mjs';

const engine = new Engine();

Hooks.once('init', () => {
	game.settings.register(MODULE_ID, 'config', { scope: 'client', config: false, type: Object, default: { ...DEFAULTS }, onChange: () => engine.refresh() });
	game.settings.register(MODULE_ID, 'useSceneLooks', { name: 'Use the GM’s scene looks', hint: 'When the GM saved a look for a scene, use it there instead of your own sliders.', scope: 'client', config: true, type: Boolean, default: true, onChange: () => engine.refresh() });
	game.settings.registerMenu(MODULE_ID, 'panel', { name: 'HD-2D look', label: 'Open the HD-2D panel', hint: 'Turn the look on or off and tune every part of it.', icon: 'fa-solid fa-mountain-sun', type: class extends HD2DConfig { constructor(o) { super(engine, o); } }, restricted: false });
	game.keybindings.register(MODULE_ID, 'toggle', {
		name: 'Turn the HD-2D look on or off',
		editable: [{ key: 'KeyH', modifiers: ['Shift'] }],
		onDown: () => {
			toggle();
			return true;
		},
	});
	game.modules.get(MODULE_ID).api = { engine, toggle, open: () => HD2DConfig.open(engine), analyzeScene, PRESETS };
});

async function toggle() {
	const cfg = { ...DEFAULTS, ...(game.settings.get(MODULE_ID, 'config') ?? {}) };
	cfg.enabled = !cfg.enabled;
	await game.settings.set(MODULE_ID, 'config', cfg);
	ui.notifications.info(`HD-2D look ${cfg.enabled ? 'on' : 'off'}.`);
}

/* the mountain button in the Lighting and Token controls: click for the panel */
Hooks.on('getSceneControlButtons', (controls) => {
	try {
		for (const key of ['tokens', 'lighting']) {
			const group = controls[key];
			if (group?.tools && !Array.isArray(group.tools)) {
				group.tools.hd2d = { name: 'hd2d', title: 'HD-2D look (Shift+H to toggle)', icon: 'fa-solid fa-mountain-sun', button: true, order: 70, visible: true, onChange: () => HD2DConfig.open(engine) };
			}
		}
	} catch (err) {
		console.warn(`${MODULE_ID} | scene control`, err);
	}
});

Hooks.on('canvasReady', () => engine.refresh({ reanalyze: true }));
Hooks.on('canvasTearDown', () => engine.detach());
Hooks.on('updateScene', (scene, changed) => {
	if (scene.id !== canvas?.scene?.id) return;
	const look = foundry.utils.hasProperty(changed, `flags.${MODULE_ID}`);
	const art = foundry.utils.hasProperty(changed, 'background.src') || foundry.utils.hasProperty(changed, 'environment.darknessLevel') || 'darkness' in changed;
	if (look || art) engine.refresh({ reanalyze: art });
});
/* darkness animates: read the scene again when it settles */
let darkTimer = null;
Hooks.on('lightingRefresh', () => {
	clearTimeout(darkTimer);
	darkTimer = setTimeout(() => {
		const d = Number(canvas?.environment?.darknessLevel ?? 0);
		if (engine.analysis && Math.abs((engine.analysis.darkness ?? 0) - d) > 0.15) engine.refresh({ reanalyze: true });
	}, 600);
});
for (const h of ['createToken', 'refreshToken']) Hooks.on(h, () => engine.filter && engine.crispTokens());

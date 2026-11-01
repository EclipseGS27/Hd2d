import { HD2DFilter } from './shader.mjs';
import { DEFAULTS, MODULE_ID, analyzeScene, resolveLook } from './look.mjs';

/**
 * Puts the look on the canvas: the filter over the scene (not over the UI, token bars or rulers), soft shadows
 * under tokens, crisp pixel sprites, and motes drifting in the light. Re-reads the scene when it changes.
 */

const lerp = (a, b, t) => a + (b - a) * t;

/** A soft round shadow, drawn once */
let SHADOW_TEX = null;
function shadowTexture() {
	if (SHADOW_TEX?.valid) return SHADOW_TEX;
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d');
	const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grd.addColorStop(0, 'rgba(0,0,0,0.75)');
	grd.addColorStop(0.45, 'rgba(0,0,0,0.45)');
	grd.addColorStop(1, 'rgba(0,0,0,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, 128, 128);
	SHADOW_TEX = PIXI.Texture.from(c);
	return SHADOW_TEX;
}

let DOT_TEX = null;
function dotTexture() {
	if (DOT_TEX?.valid) return DOT_TEX;
	const c = document.createElement('canvas');
	c.width = c.height = 32;
	const g = c.getContext('2d');
	const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
	grd.addColorStop(0, 'rgba(255,255,255,1)');
	grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
	grd.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, 32, 32);
	DOT_TEX = PIXI.Texture.from(c);
	return DOT_TEX;
}

/** A small leaf or petal: an almond shape with a lighter middle, drawn once */
let LEAF_TEX = null;
function leafTexture() {
	if (LEAF_TEX?.valid) return LEAF_TEX;
	const c = document.createElement('canvas');
	c.width = 32;
	c.height = 20;
	const g = c.getContext('2d');
	g.fillStyle = 'rgba(255,255,255,0.95)';
	g.beginPath();
	g.moveTo(2, 10);
	g.quadraticCurveTo(16, -4, 30, 10);
	g.quadraticCurveTo(16, 24, 2, 10);
	g.fill();
	g.strokeStyle = 'rgba(0,0,0,0.25)';
	g.lineWidth = 1;
	g.beginPath();
	g.moveTo(4, 10);
	g.lineTo(28, 10);
	g.stroke();
	LEAF_TEX = PIXI.Texture.from(c);
	return LEAF_TEX;
}

/**
 * Particle kinds. rise: upward speed (negative falls); drift: sideways sway; spin: turning (leaves, petals);
 * density: how many, against the motes in the light;
 * glow: additive light (dust, embers, fireflies) rather than solid bits (leaves, petals, snow, ash).
 */
const MOTES = {
	dust: { color: [0xfff1d0, 0xffe2a8, 0xffffff], size: [1.5, 3.2], rise: [4, 12], drift: 10, twinkle: 0.6, alpha: 0.55, glow: true },
	embers: { color: [0xffa040, 0xff7a2a, 0xffd27a], size: [1.5, 3], rise: [18, 40], drift: 14, twinkle: 1.8, alpha: 0.75, glow: true },
	fireflies: { color: [0xd8ff7a, 0xb8ff9a, 0xfff3a0], size: [2.2, 4], rise: [-4, 6], drift: 22, twinkle: 2.6, alpha: 0.9, glow: true },
	leaves: { density: 1.3, color: [0x6f9a3a, 0x9bb84a, 0xc98a3a, 0xd9a441, 0xa8562e], size: [10, 16], rise: [-28, -16], drift: 28, twinkle: 1.2, alpha: 0.9, spin: 2.4, leaf: true },
	petals: { density: 1.5, color: [0xffc4d8, 0xffd9e6, 0xfff0f5, 0xf7a8c4], size: [7, 11], rise: [-20, -10], drift: 30, twinkle: 1.6, alpha: 0.9, spin: 3, leaf: true },
	snow: { density: 3, color: [0xffffff, 0xeef6ff, 0xdfeeff], size: [3.5, 6.5], rise: [-26, -12], drift: 12, twinkle: 0.8, alpha: 0.9 },
	ash: { density: 2, color: [0x8a8580, 0x6f6a66, 0xa29c96], size: [2.6, 4.6], rise: [-10, -4], drift: 16, twinkle: 0.5, alpha: 0.7 },
};

export class Engine {
	constructor() {
		this.filter = null;
		this.analysis = null;
		this.preview = null;
		this.focusY = 0.55;
		this.time = 0;
		this.crisped = new Set();
	}

	/* ---------------- settings ---------------- */

	/** The player's sliders, or the scene's look when the GM saved one */
	get config() {
		if (this.preview) return this.preview;
		const own = { ...DEFAULTS, ...(game.settings.get(MODULE_ID, 'config') ?? {}) };
		const scene = canvas?.scene?.getFlag?.(MODULE_ID, 'look');
		if (scene && game.settings.get(MODULE_ID, 'useSceneLooks')) return { ...own, ...scene, enabled: own.enabled, quality: own.quality };
		return own;
	}

	get active() {
		const c = this.config;
		return !!c.enabled && !canvas?.scene?.getFlag?.(MODULE_ID, 'off') && !!canvas?.ready;
	}

	/* ---------------- lifecycle ---------------- */

	async refresh({ reanalyze = false } = {}) {
		if (!canvas?.ready) return;
		if (!this.active) return this.detach();
		if (reanalyze || !this.analysis || this.analysis.sceneId !== canvas.scene.id) {
			try {
				this.analysis = { ...(await analyzeScene(canvas.scene)), sceneId: canvas.scene.id };
			} catch (err) {
				console.warn(`${MODULE_ID} | scene analysis`, err);
				this.analysis = null;
			}
			Hooks.callAll('hd2dAnalyzed', this.analysis);
		}
		this.attach();
		this.update();
	}

	attach() {
		const env = canvas.environment ?? canvas.primary;
		const q = this.config.quality;
		if (this.filter && (this.filter.quality !== q || this.env !== env)) this.detach();
		if (!this.filter) {
			this.filter = new HD2DFilter(q);
			this.filter.resolution = canvas.app.renderer.resolution;
			this.env = env;
			this.oldArea = env.filterArea;
			env.filterArea = canvas.app.renderer.screen;
			env.filters = [...(env.filters ?? []), this.filter];
		}
		if (!this.shadowLayer || this.shadowLayer.destroyed) {
			this.shadowLayer = new PIXI.Container();
			Object.assign(this.shadowLayer, { elevation: 0, sortLayer: 650, sort: 0, zIndex: -1, eventMode: 'none' });
			canvas.primary.addChild(this.shadowLayer);
			this.shadows = new Map();
		}
		if (!this.moteLayer || this.moteLayer.destroyed) {
			this.moteLayer = new PIXI.Container();
			Object.assign(this.moteLayer, { elevation: 100000, sortLayer: 1000, sort: 0, zIndex: 0, eventMode: 'none' });
			canvas.primary.addChild(this.moteLayer);
			this.motes = [];
		}
		canvas.primary.sortDirty = true;
		canvas.primary.sortChildren?.();
		if (!this.ticking) {
			this.ticking = (dt) => this.tick(dt);
			canvas.app.ticker.add(this.ticking);
		}
	}

	detach() {
		if (this.ticking) canvas?.app?.ticker?.remove(this.ticking);
		this.ticking = null;
		if (this.filter && this.env && !this.env.destroyed) {
			this.env.filters = (this.env.filters ?? []).filter((f) => f !== this.filter);
			if (!this.env.filters.length) this.env.filters = null;
			this.env.filterArea = this.oldArea ?? null;
		}
		this.filter?.destroy?.();
		this.filter = null;
		this.env = null;
		for (const l of [this.shadowLayer, this.moteLayer]) if (l && !l.destroyed) l.destroy({ children: true });
		this.shadowLayer = this.moteLayer = null;
		this.shadows = new Map();
		this.motes = [];
		this.uncrisp();
	}

	/** Push the current values into the filter */
	update() {
		if (!this.filter) return;
		const cfg = this.config;
		this.look = resolveLook(cfg, this.analysis);
		this.filter.setLook(this.look);
		this.crispTokens();
	}

	/* ---------------- every frame ---------------- */

	tick() {
		if (!this.filter || !canvas?.ready) return;
		const dt = canvas.app.ticker.deltaMS / 1000;
		this.time += dt;
		const u = this.filter.uniforms;
		const scr = canvas.app.renderer.screen;
		u.uScreen[0] = scr.width;
		u.uScreen[1] = scr.height;
		u.uTime = this.time;
		// the camera, so the light shafts can sit on the map instead of on the screen
		const wt = canvas.stage.worldTransform;
		u.uView[0] = wt.tx;
		u.uView[1] = wt.ty;
		u.uView[2] = wt.a || 1;
		const r = canvas.dimensions?.sceneRect ?? canvas.dimensions?.rect;
		if (r) {
			// the key light sits above the scene's top-left corner; falloff is measured in scene heights
			u.uRayOrigin[0] = r.x + r.width * 0.1;
			u.uRayOrigin[1] = r.y - r.height * 0.15;
			u.uRaySpan = Math.max(1, r.height);
			u.uScene.set([r.x, r.y, Math.max(1, r.width), Math.max(1, r.height)]);
		}
		this.focusY = lerp(this.focusY, this.focusTarget(), Math.min(1, dt * 3));
		u.uFocusY = this.focusY;
		this.syncShadows();
		this.stepMotes(dt);
	}

	/** Where the sharp band sits: on your token, the acting combatant, or the middle of the screen */
	focusTarget() {
		const mode = this.config.focusFollow;
		let token = null;
		if (mode === 'combatant') token = game.combat?.combatant?.token?.object ?? null;
		if (mode === 'token' || (mode === 'combatant' && !token)) token = canvas.tokens?.controlled?.[0] ?? game.user.character?.getActiveTokens?.()?.[0] ?? null;
		if (!token?.visible) return 0.55;
		const p = canvas.stage.worldTransform.apply(token.center);
		const y = p.y / canvas.app.renderer.screen.height;
		return y < -0.1 || y > 1.1 ? 0.55 : Math.max(0.15, Math.min(0.85, y));
	}

	/* ---------------- sprite shadows ---------------- */

	syncShadows() {
		const amount = this.look?.shadows ?? 0;
		const L = this.shadowLayer;
		if (!L || L.destroyed) return;
		L.visible = amount > 0.01;
		if (!L.visible) return;
		const seen = new Set();
		for (const t of canvas.tokens?.placeables ?? []) {
			if (!t.mesh || !t.visible || (t.document.hidden && !game.user.isGM)) continue;
			seen.add(t.id);
			let s = this.shadows.get(t.id);
			if (!s || s.destroyed) {
				s = new PIXI.Sprite(shadowTexture());
				s.anchor.set(0.5);
				L.addChild(s);
				this.shadows.set(t.id, s);
			}
			// under the feet: the mesh moves during animations, so follow the mesh, not the document
			const w = t.w;
			const h = t.h;
			s.position.set(t.mesh.x + w * 0.04, t.mesh.y + h * 0.38);
			s.width = w * 0.95;
			s.height = h * 0.34;
			s.alpha = Math.min(1, 0.6 * amount) * (t.document.hidden ? 0.5 : 1);
		}
		for (const [id, s] of this.shadows) {
			if (seen.has(id)) continue;
			s.destroy();
			this.shadows.delete(id);
		}
	}

	/* ---------------- crisp pixel sprites ---------------- */

	crispTokens() {
		const mode = this.config.crisp;
		for (const t of canvas.tokens?.placeables ?? []) {
			const bt = t.mesh?.texture?.baseTexture;
			if (!bt) continue;
			const small = Math.max(bt.width, bt.height) <= 256;
			const want = mode === 'all' || (mode === 'small' && small);
			if (want && bt.scaleMode !== PIXI.SCALE_MODES.NEAREST) {
				bt.scaleMode = PIXI.SCALE_MODES.NEAREST;
				this.crisped.add(bt);
			} else if (!want && this.crisped.has(bt)) {
				bt.scaleMode = PIXI.SCALE_MODES.LINEAR;
				this.crisped.delete(bt);
			}
		}
	}

	uncrisp() {
		for (const bt of this.crisped) if (!bt.destroyed) bt.scaleMode = PIXI.SCALE_MODES.LINEAR;
		this.crisped.clear();
	}

	/* ---------------- motes ---------------- */

	stepMotes(dt) {
		const L = this.moteLayer;
		if (!L || L.destroyed) return;
		const amount = this.look?.motes ?? 0;
		const kind = MOTES[this.look?.moteKind] ?? MOTES.dust;
		const scr = canvas.app.renderer.screen;
		const inv = canvas.stage.worldTransform.clone().invert();
		const tl = inv.apply({ x: 0, y: 0 });
		const br = inv.apply({ x: scr.width, y: scr.height });
		// motes live on the map: sizes and speeds are in grid units, and there are as many per square as at
		// any zoom, so zooming in brings you closer to them instead of dragging them along with the camera
		const g = (canvas.dimensions?.size || 100) / 100;
		const area = ((br.x - tl.x) * (br.y - tl.y)) / (1920 * 1080 * g * g);
		// weather (snow, ash, petals) falls thicker than the motes in the light
		const want = Math.min(260, Math.round(amount * 70 * (kind.density ?? 1) * area));
		const R = (a, b) => a + Math.random() * (b - a);
		const falls = kind.rise[1] < 0;
		const spawn = (m, anywhere) => {
			m.x = R(tl.x, br.x);
			// rising kinds come in from below, falling ones from above
			m.y = anywhere ? R(tl.y, br.y) : falls ? tl.y - 10 * g : br.y + 10 * g;
			m.rot = R(0, Math.PI * 2);
			if (m.s) {
				const tex = kind.leaf ? leafTexture() : dotTexture();
				if (m.s.texture !== tex) m.s.texture = tex;
				m.s.blendMode = kind.glow ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
				m.s.rotation = 0;
			}
			m.vx = R(-1, 1) * kind.drift;
			m.vy = -R(kind.rise[0], kind.rise[1]);
			m.ph = R(0, Math.PI * 2);
			m.sz = R(kind.size[0], kind.size[1]);
			m.tint = kind.color[Math.floor(Math.random() * kind.color.length)];
			m.kind = kind;
			m.age = 0;
		};
		while (this.motes.length < want) {
			const s = new PIXI.Sprite(dotTexture());
			s.anchor.set(0.5);
			const m = { s };
			spawn(m, true);
			L.addChild(s);
			this.motes.push(m);
		}
		while (this.motes.length > want) this.motes.pop().s.destroy();
		const pad = 40 * g;
		for (const m of this.motes) {
			if (m.kind !== kind) spawn(m, true);
			m.ph += dt * kind.twinkle;
			m.age += dt;
			m.x += (m.vx + Math.sin(m.ph * 0.7) * kind.drift * 0.6) * dt * g;
			m.y += (m.vy + Math.cos(m.ph * 0.5) * 3) * dt * g;
			// risen off the top (or fallen off the bottom): back in from the other side; left behind by the camera:
			// somewhere in view
			if ((falls ? m.y > br.y + 20 * g : m.y < tl.y - 20 * g) && m.x > tl.x - pad && m.x < br.x + pad) spawn(m, false);
			else if (m.y < tl.y - pad || m.x < tl.x - pad || m.x > br.x + pad || m.y > br.y + pad) spawn(m, true);
			m.s.position.set(m.x, m.y);
			m.s.tint = m.tint;
			if (kind.spin) {
				// leaves and petals tumble: turn, and flip by squashing one way
				m.rot += dt * kind.spin * (0.5 + Math.abs(Math.sin(m.ph * 0.6)));
				m.s.rotation = m.rot;
				m.s.scale.set((m.sz / 16) * g, (m.sz / 16) * g * (0.35 + 0.65 * Math.abs(Math.cos(m.ph * 0.9))));
			} else m.s.scale.set((m.sz / 16) * g);
			m.s.alpha = kind.alpha * (kind.glow ? 0.45 + 0.55 * Math.abs(Math.sin(m.ph)) : 1) * Math.min(1, amount + 0.3) * Math.min(1, m.age / 0.6);
		}
	}
}

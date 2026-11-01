/**
 * What the HD-2D look is made of: the sliders (each player's, or the scene's when the GM saved one), the
 * presets, and the scene analysis that tunes everything to the map's own colors and light.
 */

export const MODULE_ID = 'fu-hd2d';

/** Every slider: [key, label, min, max, step, group, hint] */
export const SLIDERS = [
	['tiltShift', 'Depth of field', 0, 1.5, 0.05, 'Lens', 'How soft the top and bottom of the screen get, like a miniature diorama.'],
	['focusWidth', 'Focus band', 0.1, 0.9, 0.05, 'Lens', 'How tall the sharp band in the middle is.'],
	['bloom', 'Bloom', 0, 2, 0.05, 'Light', 'Glow around lights, fire, magic and bright spots.'],
	['threshold', 'Bloom threshold', 0.2, 0.95, 0.01, 'Light', 'How bright something must be to glow. Lower glows more.'],
	['rays', 'Light shafts', 0, 1.5, 0.05, 'Light', 'Soft rays from the key light.'],
	['motes', 'Particles', 0, 1.5, 0.05, 'Light', 'Dust, embers, fireflies, leaves, petals, snow or ash drifting through the scene (pick which below, or let Auto-tune choose).'],
	['haze', 'Distance haze', 0, 1.5, 0.05, 'Light', 'The far side of the diorama (the top of the screen) fades into soft, light air, as in Octopath Traveler.'],
	['exposure', 'Exposure', -1, 1, 0.02, 'Color', 'Brighter or darker overall.'],
	['contrast', 'Contrast', 0.6, 1.6, 0.02, 'Color', ''],
	['saturation', 'Saturation', 0, 2, 0.02, 'Color', ''],
	['warmth', 'Warmth', -1.5, 1.5, 0.05, 'Color', 'Cooler (blue) or warmer (gold).'],
	['splitTone', 'Split toning', 0, 1.5, 0.05, 'Color', 'Shadows lean cool and highlights warm (or the reverse, from the scene).'],
	['vignette', 'Vignette', 0, 1, 0.02, 'Film', 'Darker corners.'],
	['grain', 'Film grain', 0, 1, 0.02, 'Film', ''],
	['aberration', 'Lens fringe', 0, 1, 0.02, 'Film', 'Color fringing toward the corners.'],
	['shadows', 'Sprite shadows', 0, 1.5, 0.05, 'Sprites', 'Soft contact shadows under every token, so sprites stand on the map.'],
];

export const DEFAULTS = {
	enabled: true,
	auto: true,
	quality: 'high',
	focusFollow: 'token',
	crisp: 'small',
	tiltShift: 0.7,
	focusWidth: 0.4,
	bloom: 0.7,
	threshold: 0.62,
	rays: 0.45,
	motes: 0.6,
	haze: 0.35,
	particles: 'auto',
	exposure: 0,
	contrast: 1.06,
	saturation: 1.15,
	warmth: 0.2,
	splitTone: 0.6,
	vignette: 0.5,
	grain: 0.22,
	aberration: 0.25,
	shadows: 0.8,
};

export const PRESETS = {
	classic: { label: 'Classic HD-2D', values: {} },
	dreamy: { label: 'Soft and dreamy', values: { haze: 0.65, tiltShift: 1.05, focusWidth: 0.3, bloom: 1.1, threshold: 0.5, rays: 0.7, motes: 0.9, contrast: 0.98, saturation: 1.05, warmth: 0.35, splitTone: 0.8, vignette: 0.55, grain: 0.15, aberration: 0.35 } },
	crisp: { label: 'Crisp and clean', values: { haze: 0.15, tiltShift: 0.35, focusWidth: 0.55, bloom: 0.45, threshold: 0.72, rays: 0.2, motes: 0.3, contrast: 1.1, saturation: 1.2, warmth: 0.1, splitTone: 0.35, vignette: 0.3, grain: 0.08, aberration: 0.1 } },
	dramatic: { label: 'Dramatic', values: { haze: 0.3, tiltShift: 0.85, focusWidth: 0.35, bloom: 0.95, threshold: 0.55, rays: 0.6, motes: 0.5, exposure: -0.12, contrast: 1.22, saturation: 1.05, warmth: 0, splitTone: 1.1, vignette: 0.75, grain: 0.3, aberration: 0.3 } },
	subtle: { label: 'Subtle', values: { haze: 0.15, tiltShift: 0.3, focusWidth: 0.6, bloom: 0.35, rays: 0.15, motes: 0.25, contrast: 1.02, saturation: 1.06, warmth: 0.1, splitTone: 0.3, vignette: 0.25, grain: 0.08, aberration: 0.05, shadows: 0.6 } },
};

/* ------------------------------------------------------------------ */
/*  Scene analysis                                                     */
/* ------------------------------------------------------------------ */

function rgb2hsl(r, g, b) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return [h * 60, s, l];
}

function hsl2rgb(h, s, l) {
	const k = (n) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

async function pixelsOf(src, size = 48) {
	if (!src) return null;
	const isVideo = /\.(webm|mp4|m4v|ogv)(\?|$)/i.test(src);
	const el = isVideo ? document.createElement('video') : new Image();
	el.crossOrigin = 'anonymous';
	el.muted = true;
	await new Promise((res, rej) => {
		el.addEventListener(isVideo ? 'loadeddata' : 'load', res, { once: true });
		el.addEventListener('error', rej, { once: true });
		el.src = src;
	});
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(el, 0, 0, size, size);
	if (isVideo) el.removeAttribute('src');
	return ctx.getImageData(0, 0, size, size).data;
}

/**
 * Read the scene: its background's colors and how dark the scene is, and turn them into a starting look.
 * @returns {Promise<object>} the analysis (mood words and tuning)
 */
export async function analyzeScene(scene) {
	const darkness = Number(canvas?.environment?.darknessLevel ?? scene?.environment?.darknessLevel ?? scene?.darkness ?? 0) || 0;
	let data = null;
	try {
		data = await pixelsOf(scene?.background?.src);
	} catch {
		data = null;
	}
	let lum = 0.5;
	let sat = 0.35;
	let warm = 0;
	let hue = 40;
	if (data) {
		let n = 0;
		let L = 0;
		let S = 0;
		let hx = 0;
		let hy = 0;
		let wsum = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 20) continue;
			const [h, s, l] = rgb2hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
			L += l;
			S += s;
			n++;
			// hue as an average direction, weighted by how colorful each pixel is
			const w = s * (1 - Math.abs(l - 0.5) * 2);
			hx += Math.cos((h * Math.PI) / 180) * w;
			hy += Math.sin((h * Math.PI) / 180) * w;
			wsum += w;
		}
		if (n) {
			lum = L / n;
			sat = S / n;
		}
		if (wsum > 0.001) hue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
		// warm: reds, oranges, yellows; cool: cyans, blues, purples; greens count as neither
		const green = Math.exp(-(((hue - 115) / 40) ** 2));
		warm = Math.cos(((hue - 35) * Math.PI) / 180) * (1 - green) * Math.min(1, sat * 2.5);
	}
	const night = Math.max(darkness, lum < 0.22 ? 0.6 : 0);
	const words = [night > 0.55 ? 'night' : lum > 0.55 ? 'bright' : lum < 0.32 ? 'dim' : 'daylight', warm > 0.35 ? 'warm' : warm < -0.35 ? 'cool' : 'neutral', sat > 0.45 ? 'vivid' : sat < 0.2 ? 'muted' : ''].filter(Boolean);
	const H = (deg, s, l) => hsl2rgb(((deg % 360) + 360) % 360, s, l);
	return {
		words,
		lum,
		sat,
		hue,
		warm,
		darkness,
		night,
		tune: {
			// dark maps get a little lift, very bright ones a little less
			exposure: (0.42 - lum) * 0.5 - night * 0.05,
			// the map's own palette leans the white balance a little further its way; nights lean blue
			warmth: warm * 0.25 - night * 0.45,
			saturation: sat < 0.25 ? 1.12 : sat > 0.5 ? 0.95 : 1,
			bloom: 1 + night * 0.35,
			threshold: -night * 0.08 + (lum > 0.6 ? 0.06 : 0),
			rays: night > 0.55 ? 0.35 : lum > 0.45 ? 1.1 : 0.8,
			motes: 1,
			// the HD-2D grade: cool shadows and warm highlights, leaning a little toward the map's own mood
			shadowTint: night > 0.55 ? H(228, 0.55, 0.6) : warm < -0.35 ? H(255, 0.4, 0.62) : H(205, 0.42, 0.62),
			highTint: night > 0.55 ? H(42, 0.45, 0.72) : warm < -0.35 ? H(30, 0.35, 0.76) : H(38, 0.55, 0.75),
			rayColor: night > 0.55 ? H(210, 0.6, 0.75) : H(Math.min(60, Math.max(25, hue)), 0.7, 0.78),
			moteKind: night > 0.55 ? 'fireflies' : warm > 0.4 && sat > 0.35 ? 'embers' : 'dust',
			// the air in the distance: pale sky by day, deep blue at night, a little of the map's own hue
			haze: night > 0.55 ? 0.8 : lum > 0.6 ? 0.85 : 1,
			hazeColor: night > 0.55 ? H(222, 0.35, 0.32) : H(warm > 0.3 ? 38 : 205, 0.28, 0.82),
		},
	};
}

/* ------------------------------------------------------------------ */
/*  Resolving the final values                                         */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The sliders, with the scene's tuning on top when Auto is on.
 * @param {object} cfg slider values
 * @param {object|null} analysis from analyzeScene
 */
export function resolveLook(cfg, analysis) {
	const t = cfg.auto && analysis ? analysis.tune : null;
	return {
		tiltShift: cfg.tiltShift,
		focusWidth: cfg.focusWidth,
		bloom: cfg.bloom * (t?.bloom ?? 1),
		threshold: clamp(cfg.threshold + (t?.threshold ?? 0), 0.15, 0.98),
		rays: cfg.rays * (t?.rays ?? 1),
		motes: cfg.particles === 'none' ? 0 : cfg.motes * (t?.motes ?? 1),
		moteKind: cfg.particles && !['auto', 'none'].includes(cfg.particles) ? cfg.particles : (t?.moteKind ?? 'dust'),
		haze: (cfg.haze ?? 0) * (t?.haze ?? 1),
		hazeColor: t?.hazeColor ?? [0.78, 0.85, 0.92],
		exposure: cfg.exposure + (t?.exposure ?? 0),
		contrast: cfg.contrast,
		saturation: cfg.saturation * (t?.saturation ?? 1),
		warmth: cfg.warmth + (t?.warmth ?? 0),
		splitTone: cfg.splitTone,
		shadowTint: t?.shadowTint ?? [0.55, 0.7, 0.95],
		highTint: t?.highTint ?? [1, 0.9, 0.75],
		rayColor: t?.rayColor ?? [1, 0.9, 0.7],
		vignette: cfg.vignette,
		grain: cfg.grain,
		aberration: cfg.aberration,
		shadows: cfg.shadows,
	};
}

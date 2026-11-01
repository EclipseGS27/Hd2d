/**
 * The HD-2D look as one screen-space filter: tilt-shift depth of field around a focus band, bloom, light
 * shafts (pinned to the map), distance haze, color grading (exposure, white balance, split toning, contrast, saturation),
 * chromatic aberration, vignette and film grain. One pass, so it stays cheap enough for every table.
 */

const FRAG = (taps) => `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform sampler2D uBloomTex;
uniform vec4 uBloomMap;
uniform vec4 inputSize;
uniform vec4 outputFrame;
uniform vec4 filterClamp;

uniform vec2 uScreen;
uniform float uTime;
uniform float uTilt;
uniform float uFocusY;
uniform float uFocusW;
uniform float uBloom;
uniform float uThresh;
uniform float uExposure;
uniform float uContrast;
uniform float uSat;
uniform float uWarmth;
uniform float uTint;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uRays;
uniform vec3 uRayColor;
uniform float uHaze;
uniform vec3 uHazeColor;
uniform vec2 uRayOrigin;
uniform vec3 uView;
uniform float uRaySpan;
uniform vec4 uScene;
uniform float uVignette;
uniform float uGrain;
uniform float uAberr;

#define TAPS ${taps}

vec3 tex(vec2 uv) { return texture2D(uSampler, clamp(uv, filterClamp.xy, filterClamp.zw)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
	vec4 base = texture2D(uSampler, vTextureCoord);
	vec2 px = inputSize.zw;
	vec2 screen = (vTextureCoord * inputSize.xy + outputFrame.xy) / uScreen;
	float aspect = uScreen.x / uScreen.y;

	// tilt-shift: sharp in the focus band, softer toward the top and bottom of the screen
	float dist = abs(screen.y - uFocusY);
	float edge = smoothstep(uFocusW * 0.5, uFocusW * 0.5 + 0.38, dist);
	float radius = uTilt * edge * 10.0;

	vec3 acc = base.rgb;
	float wsum = 1.0;
	const float GA = 2.39996323;
	for (int i = 0; i < TAPS; i++) {
		float fi = float(i) + 1.0;
		float r = sqrt(fi / float(TAPS));
		vec2 o = vec2(cos(fi * GA), sin(fi * GA)) * r;
		if (radius > 0.4) {
			acc += tex(vTextureCoord + o * radius * px);
			wsum += 1.0;
		}
	}
	vec3 col = acc / wsum;

	// chromatic aberration toward the corners
	if (uAberr > 0.001) {
		vec2 dir = (screen - 0.5) * uAberr * 8.0 * px;
		col.r = mix(col.r, tex(vTextureCoord + dir).r, 0.85);
		col.b = mix(col.b, tex(vTextureCoord - dir).b, 0.85);
	}

	// bloom: the bright parts, blurred wide in their own passes
	// (its texture is a different size from the screen's, so map the coordinates across and stay inside what was drawn)
	vec2 buv = min(vTextureCoord * uBloomMap.xy, uBloomMap.zw);
	col += texture2D(uBloomTex, buv).rgb * uBloom * 1.4;

	// exposure and white balance
	col *= exp2(uExposure);
	col *= vec3(1.0 + 0.09 * uWarmth, 1.0 + 0.015 * uWarmth, 1.0 - 0.11 * uWarmth);

	// light shafts from the key light: soft rays that drift. They are pinned to the map (uView is the camera's
	// offset and zoom, uRayOrigin a point on the scene), so they stay put when you pan or zoom.
	if (uRays > 0.001) {
		vec2 world = (screen * uScreen - uView.xy) / uView.z;
		vec2 p = (world - uRayOrigin) / uRaySpan;
		float a = atan(p.y, p.x);
		float d = length(p);
		float s = sin(a * 23.0 + uTime * 0.15) * 0.5 + 0.5;
		s *= sin(a * 37.0 - uTime * 0.11 + 1.7) * 0.5 + 0.5;
		s = pow(s, 2.0);
		float fall = exp(-d * 1.6) * smoothstep(0.0, 0.25, d);
		// only on the map, not on the dark padding around it
		vec2 q = (world - uScene.xy) / uScene.zw;
		vec2 e = 0.02 * vec2(uScene.w / uScene.z, 1.0);
		float inside = smoothstep(0.0, e.x, q.x) * smoothstep(0.0, e.x, 1.0 - q.x) * smoothstep(0.0, e.y, q.y) * smoothstep(0.0, e.y, 1.0 - q.y);
		col += uRayColor * s * fall * uRays * 0.55 * inside;
	}

	// distance haze: above the focus band the diorama recedes into soft, light air
	if (uHaze > 0.001) {
		float top = max(0.05, uFocusY - uFocusW * 0.5);
		float far = clamp((top - screen.y) / top, 0.0, 1.0);
		far = far * far * (3.0 - 2.0 * far);
		float hz = clamp(uHaze * 0.5 * far, 0.0, 0.8);
		vec3 airy = mix(vec3(luma(col)), col, 0.55) * 0.55 + uHazeColor * 0.55;
		col = mix(col, airy, hz);
	}

	// split toning: shadows lean one way, highlights the other
	float l = luma(col);
	col = mix(col, col * uShadowTint * 1.6, uTint * (1.0 - smoothstep(0.0, 0.55, l)) * 0.6);
	col = mix(col, col * uHighTint * 1.25, uTint * smoothstep(0.45, 1.0, l) * 0.45);

	// a soft S-curve and contrast around the middle, then saturation
	col = clamp(col, 0.0, 1.0);
	col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);
	col = (col - 0.5) * uContrast + 0.5;
	l = luma(col);
	col = mix(vec3(l), col, uSat);

	// vignette and grain
	vec2 v = (screen - 0.5) * vec2(aspect, 1.0);
	col *= mix(1.0, smoothstep(1.05, 0.25, length(v) * 1.15), uVignette);
	col += (hash(screen * uScreen + fract(uTime) * 91.7) - 0.5) * 0.08 * uGrain;

	gl_FragColor = vec4(clamp(col, 0.0, 1.0) * base.a, base.a);
}
`;

/** Keeps only what is brighter than the threshold, for the bloom */
const BRIGHT = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float uThresh;
void main() {
	vec4 c = texture2D(uSampler, vTextureCoord);
	float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
	gl_FragColor = vec4(c.rgb * smoothstep(uThresh, uThresh + 0.22, l), 1.0);
}
`;

/**
 * One direction of a 9-tap gaussian for the bloom. PIXI's own blur reads its source with the screen texture's
 * coordinates, which is wrong for a half-size pooled texture (it is padded to a different size): this one maps
 * the coordinates onto its source itself (uMap) and never samples past what was drawn (uMax).
 */
const BLUR = `
precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec2 uMap;
uniform vec2 uMax;
uniform vec2 uDir;
vec3 at(vec2 uv) { return texture2D(uSampler, clamp(uv, vec2(0.0), uMax)).rgb; }
void main() {
	vec2 uv = vTextureCoord * uMap;
	vec3 c = at(uv) * 0.2270;
	c += (at(uv + uDir) + at(uv - uDir)) * 0.1946;
	c += (at(uv + uDir * 2.0) + at(uv - uDir * 2.0)) * 0.1216;
	c += (at(uv + uDir * 3.0) + at(uv - uDir * 3.0)) * 0.0540;
	c += (at(uv + uDir * 4.0) + at(uv - uDir * 4.0)) * 0.0162;
	gl_FragColor = vec4(c, 1.0);
}
`;

/** Tap spacing of each blur round, in screen pixels: wider rounds stack into one soft, wide glow */
const ROUNDS = { low: [5], high: [3, 7], ultra: [2, 5, 10] };

export class HD2DFilter extends PIXI.Filter {
	constructor(quality = 'high') {
		super(undefined, FRAG(quality === 'low' ? 8 : quality === 'ultra' ? 24 : 14), {
			uScreen: new Float32Array([1, 1]),
			uBloomTex: PIXI.Texture.EMPTY,
			uBloomMap: new Float32Array([1, 1, 1, 1]),
			uTime: 0,
			uTilt: 0.6,
			uFocusY: 0.55,
			uFocusW: 0.35,
			uBloom: 0.6,
			uThresh: 0.62,
			uExposure: 0,
			uContrast: 1.05,
			uSat: 1.15,
			uWarmth: 0.2,
			uTint: 0.5,
			uShadowTint: new Float32Array([0.55, 0.7, 0.95]),
			uHighTint: new Float32Array([1, 0.9, 0.75]),
			uRays: 0.3,
			uRayColor: new Float32Array([1, 0.9, 0.7]),
			uHaze: 0.35,
			uHazeColor: new Float32Array([0.78, 0.85, 0.92]),
			uRayOrigin: new Float32Array([0, 0]),
			uView: new Float32Array([0, 0, 1]),
			uRaySpan: 1000,
			uScene: new Float32Array([-1e6, -1e6, 2e6, 2e6]),
			uVignette: 0.45,
			uGrain: 0.25,
			uAberr: 0.2,
		});
		this.quality = quality;
		this.bright = new PIXI.Filter(undefined, BRIGHT, { uThresh: 0.62 });
		this.blur = new PIXI.Filter(undefined, BLUR, { uMap: new Float32Array([1, 1]), uMax: new Float32Array([1, 1]), uDir: new Float32Array([0, 0]) });
		this.rounds = ROUNDS[quality] ?? ROUNDS.high;
	}

	/** Bright parts into a half-size texture, a few blur rounds there, then everything else in one pass */
	apply(filterManager, input, output, clearMode) {
		const res = this.resolution * 0.5;
		const a = filterManager.getFilterTexture(input, res);
		const b = filterManager.getFilterTexture(input, res);
		this.bright.uniforms.uThresh = this.uniforms.uThresh;
		this.bright.apply(filterManager, input, a, PIXI.CLEAR_MODES.CLEAR);
		// Every pass is drawn with the screen texture's coordinates; the pool pads the half-size textures to
		// other sizes, so scale those coordinates onto them and stay inside the part that was drawn
		const f = input.filterFrame ?? { width: input.width, height: input.height };
		const sx = input.width / a.width, sy = input.height / a.height;
		const mx = (f.width - 1 / res) / a.width, my = (f.height - 1 / res) / a.height;
		const u = this.blur.uniforms;
		u.uMap[0] = sx;
		u.uMap[1] = sy;
		u.uMax[0] = mx;
		u.uMax[1] = my;
		for (const step of this.rounds) {
			u.uDir[0] = step / a.width;
			u.uDir[1] = 0;
			this.blur.apply(filterManager, a, b, PIXI.CLEAR_MODES.CLEAR);
			u.uDir[0] = 0;
			u.uDir[1] = step / a.height;
			this.blur.apply(filterManager, b, a, PIXI.CLEAR_MODES.CLEAR);
		}
		this.uniforms.uBloomTex = a;
		const m = this.uniforms.uBloomMap;
		m[0] = sx;
		m[1] = sy;
		m[2] = mx;
		m[3] = my;
		filterManager.applyFilter(this, input, output, clearMode);
		filterManager.returnFilterTexture(a);
		filterManager.returnFilterTexture(b);
	}

	destroy() {
		this.bright?.destroy();
		this.blur?.destroy();
		super.destroy();
	}

	/** @param {object} p resolved look values (see look.mjs) */
	setLook(p) {
		const u = this.uniforms;
		u.uTilt = p.tiltShift;
		u.uFocusW = p.focusWidth;
		u.uBloom = p.bloom;
		u.uThresh = p.threshold;
		u.uExposure = p.exposure;
		u.uContrast = p.contrast;
		u.uSat = p.saturation;
		u.uWarmth = p.warmth;
		u.uTint = p.splitTone;
		u.uShadowTint.set(p.shadowTint);
		u.uHighTint.set(p.highTint);
		u.uRays = p.rays;
		u.uRayColor.set(p.rayColor);
		u.uHaze = p.haze ?? 0;
		u.uHazeColor.set(p.hazeColor ?? [0.78, 0.85, 0.92]);
		u.uVignette = p.vignette;
		u.uGrain = p.grain;
		u.uAberr = p.aberration;
	}
}

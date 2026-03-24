/**
 * Pre-rendered sprite cache for Canvas 2D glow effects.
 * Adapted from agent-flow (Apache 2.0).
 */

const glowCache = new Map<string, HTMLCanvasElement>();
const textCache = new Map<string, number>();
const TEXT_CACHE_LIMIT = 2000;

/**
 * Get or create a pre-rendered radial gradient glow sprite.
 */
export function getGlowSprite(
  color: string,
  radius: number,
  innerAlpha: number,
  outerAlpha: number,
): HTMLCanvasElement {
  const key = `${color}|${radius}|${innerAlpha}|${outerAlpha}`;
  let canvas = glowCache.get(key);
  if (canvas) return canvas;

  const size = Math.ceil(radius * 2);
  canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;

  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, radius);
  grad.addColorStop(0, `${color}${Math.round(innerAlpha * 255).toString(16).padStart(2, '0')}`);
  grad.addColorStop(1, `${color}${Math.round(outerAlpha * 255).toString(16).padStart(2, '0')}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  glowCache.set(key, canvas);
  return canvas;
}

/**
 * Get or create a pre-rendered agent glow sprite (inner + outer radius).
 */
export function getAgentGlowSprite(
  color: string,
  innerRadius: number,
  outerRadius: number,
): HTMLCanvasElement {
  const key = `agent|${color}|${innerRadius}|${outerRadius}`;
  let canvas = glowCache.get(key);
  if (canvas) return canvas;

  const size = Math.ceil(outerRadius * 2);
  canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;

  const grad = ctx.createRadialGradient(cx, cx, innerRadius, cx, cx, outerRadius);
  grad.addColorStop(0, `${color}40`);
  grad.addColorStop(0.5, `${color}15`);
  grad.addColorStop(1, `${color}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  glowCache.set(key, canvas);
  return canvas;
}

/**
 * Cached text width measurement.
 */
export function measureTextCached(ctx: CanvasRenderingContext2D, font: string, text: string): number {
  const key = `${font}|${text}`;
  let w = textCache.get(key);
  if (w !== undefined) return w;

  if (textCache.size > TEXT_CACHE_LIMIT) textCache.clear();

  const prevFont = ctx.font;
  ctx.font = font;
  w = ctx.measureText(text).width;
  ctx.font = prevFont;
  textCache.set(key, w);
  return w;
}

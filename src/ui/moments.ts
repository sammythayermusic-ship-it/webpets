// Share a moment (AFTER-BAKEOFF Step F2.1): the app keeps the last few seconds of the pet, bubble
// included, and one click turns them into a short video in Downloads, ready to post or send. Nothing
// is uploaded.
//
// How: the habitat canvas streams into a hidden <video> (the WebGL canvas cannot be read directly
// between frames); ten times a second a frame of it is drawn onto a backdrop, the speech bubble is
// drawn on top from the DOM, and the result is kept as a small JPEG. Saving plays those frames into
// a second canvas while a MediaRecorder records it.

import { createPacer } from '../render/pacer';

export interface MomentRecorder {
  /** Save the last few seconds as a video. Resolves to where it went, or null if there is nothing yet. */
  saveClip(name: string): Promise<string | null>;
  /** The latest frame, for the pet card. */
  latestFrame(): Promise<ImageBitmap | null>;
  destroy(): void;
}

export interface MomentDeps {
  canvas: HTMLCanvasElement;
  /** Where the bubble lives (#ui). */
  root: HTMLElement;
  save(name: string, bytes: Uint8Array): Promise<string>;
}

export const MOMENTS = Object.freeze({
  FPS: 10,
  /** How much of the past is kept. */
  KEEP_MS: 6000,
  /** Clip width in pixels; the height follows the window. */
  WIDTH: 640,
  /** The last frame is held this long at the end, so a clip does not stop mid-thought. */
  HOLD_MS: 600,
});

const MIME_PREFS = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME_PREFS) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

/** The backdrop every frame sits on: the window is transparent around the habitat. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#272c3a');
  g.addColorStop(1, '#14161d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A small mark in the corner, so a shared clip says where it came from. */
export function drawMark(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  ctx.save();
  ctx.font = `600 ${Math.round(11 * k)}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('WebPets', w - 8 * k, h - 6 * k);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The speech bubble as it is on screen right now, drawn at scale `k` (window CSS px to frame px). */
export function drawBubble(ctx: CanvasRenderingContext2D, root: HTMLElement, k: number): void {
  const bubble = root.querySelector<HTMLElement>('.speech-bubble');
  if (!bubble || bubble.hidden) return;
  const text = bubble.querySelector('.speech-text')?.textContent ?? '';
  if (text === '') return;
  const more = bubble.querySelector<HTMLElement>('.speech-more');
  const link = more && !more.hidden ? (more.textContent ?? '') : '';
  const x = bubble.offsetLeft * k;
  const y = bubble.offsetTop * k;
  const w = bubble.offsetWidth * k;
  const padX = 10 * k;
  const padY = 6 * k;
  ctx.save();
  ctx.font = `${11 * k}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
  const lines = wrap(ctx, text, w - 2 * padX);
  const lh = 11 * 1.35 * k;
  const h = padY * 2 + lines.length * lh + (link ? 13 * k : 0);
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10 * k;
  ctx.shadowOffsetY = 2 * k;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  roundRect(ctx, x, y, w, h, 12 * k);
  ctx.fill();
  // The tail toward the pet.
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 5 * k, y + h - 1);
  ctx.lineTo(x + w / 2, y + h + 5 * k);
  ctx.lineTo(x + w / 2 + 5 * k, y + h - 1);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#0f1115';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + i * lh));
  if (link) {
    ctx.font = `500 ${10 * k}px -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif`;
    ctx.fillStyle = '#6b7280';
    ctx.fillText(link, x + padX, y + padY + lines.length * lh + 3 * k);
  }
  ctx.restore();
}

export function createMomentRecorder(deps: MomentDeps): MomentRecorder | null {
  const { canvas, root } = deps;
  if (typeof canvas.captureStream !== 'function') return null;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = canvas.captureStream(MOMENTS.FPS);
  void video.play().catch(() => undefined);

  const frame = document.createElement('canvas');
  const ctx = frame.getContext('2d');
  if (!ctx) return null;
  const frames: { t: number; blob: Blob }[] = [];
  let busy = false;

  function size(): { w: number; h: number; k: number } {
    const cssW = canvas.clientWidth || root.clientWidth || 1;
    const cssH = canvas.clientHeight || root.clientHeight || 1;
    const w = Math.min(MOMENTS.WIDTH, Math.round(cssW * 2));
    const k = w / cssW;
    return { w: w - (w % 2), h: Math.round(cssH * k) - (Math.round(cssH * k) % 2), k };
  }

  // A worker-driven tick, like the scene's: the packaged window is often "hidden" to WebKit, which
  // clamps page timers to once a second.
  const pacer = createPacer(1000 / MOMENTS.FPS, () => {
    if (busy || video.readyState < 2) return;
    const { w, h, k } = size();
    if (frame.width !== w || frame.height !== h) {
      frame.width = w;
      frame.height = h;
    }
    drawBackdrop(ctx, w, h);
    ctx.drawImage(video, 0, 0, w, h);
    drawBubble(ctx, root, k);
    drawMark(ctx, w, h, k);
    const t = Date.now();
    frame.toBlob(
      (blob) => {
        if (!blob) return;
        frames.push({ t, blob });
        while (frames.length > 0 && frames[0]!.t < Date.now() - MOMENTS.KEEP_MS) frames.shift();
      },
      'image/jpeg',
      0.86,
    );
  });

  async function saveClip(name: string): Promise<string | null> {
    const mime = pickMime();
    const clip = frames.slice();
    if (mime === null || clip.length < MOMENTS.FPS) return null;
    busy = true;
    try {
      const first = await createImageBitmap(clip[0]!.blob);
      const out = document.createElement('canvas');
      out.width = first.width;
      out.height = first.height;
      const octx = out.getContext('2d')!;
      octx.drawImage(first, 0, 0);
      const stream = out.captureStream(MOMENTS.FPS);
      const rec = mime === '' ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
      const bitmaps = await Promise.all(clip.map((f) => createImageBitmap(f.blob)));
      rec.start();
      // Played on the worker tick too, so a "hidden" window does not turn the clip into slow motion.
      await new Promise<void>((resolve) => {
        let i = 0;
        let held = 0;
        const play = createPacer(1000 / MOMENTS.FPS, () => {
          if (i < bitmaps.length) octx.drawImage(bitmaps[i++]!, 0, 0);
          else if (++held >= MOMENTS.HOLD_MS / (1000 / MOMENTS.FPS)) {
            play.stop();
            resolve();
          }
        });
      });
      rec.stop();
      await done;
      const type = rec.mimeType || mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
      return await deps.save(`${name}.${ext}`, bytes);
    } finally {
      busy = false;
    }
  }

  return {
    saveClip,
    async latestFrame() {
      const last = frames[frames.length - 1];
      return last ? createImageBitmap(last.blob) : null;
    },
    destroy() {
      pacer.stop();
      video.srcObject = null;
    },
  };
}

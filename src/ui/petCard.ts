// The pet card (AFTER-BAKEOFF Step F2.2): a picture made to be sent. The pet's name, a portrait
// (the latest frame of the habitat), its species, personality, age, how close you are, and a
// favourite thing it has said. 1080 x 1350, the shape the big apps show best. Drawn on a canvas; saved
// to Downloads like a clip (platform.share).

import type { Personality, Species } from '../sim/types';
import { drawBackdrop } from './moments';

export const CARD_W = 1080;
export const CARD_H = 1350;

export interface PetCardInfo {
  name: string;
  id: string;
  species: Species;
  personality: Personality;
  bornAt: number;
  now: number;
  /** "best friends", or null before there is a bond to speak of. */
  bond: string | null;
  /** What it calls you, if it knows. */
  you: string | null;
  quote: string | null;
  portrait: ImageBitmap | null;
}

const SPECIES_WORD: Record<Species, string> = { fish: 'Goldfish', hamster: 'Hamster', frog: 'Frog', chicken: 'Chicken' };
const PERSONALITY_WORD: Record<Personality, string> = { sarcastic: 'Sarcastic', anxious: 'Anxious', zen: 'Zen', hyper: 'Hyper' };
/** Each personality's colours, top to bottom. */
const TINT: Record<Personality, [string, string]> = {
  sarcastic: ['#2b3a67', '#0f1730'],
  anxious: ['#f6a08c', '#8c4a6b'],
  zen: ['#5fb3a3', '#1d4d57'],
  hyper: ['#ff9a3c', '#c2366b'],
};

/** "born today", "4 days old", "3 weeks old", "2 months old", "1 year old". */
export function ageText(bornAt: number, now: number): string {
  const days = Math.max(0, Math.floor((now - bornAt) / 86_400_000));
  const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'} old`;
  if (days === 0) return 'born today';
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.floor(days / 7), 'week');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

const FONT = '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (line !== '' && lines.length < maxLines) lines.push(line);
  return lines;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the card onto a 1080 x 1350 canvas. */
export function drawPetCard(ctx: CanvasRenderingContext2D, info: PetCardInfo): void {
  const [top, bottom] = TINT[info.personality];
  const g = ctx.createLinearGradient(0, 0, CARD_W * 0.3, CARD_H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Name.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `600 34px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('MEET', 64, 104);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 104px ${FONT}`;
  ctx.fillText(info.name, 60, 200);
  const nameW = ctx.measureText(info.name).width;
  ctx.font = `600 36px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(info.id, 60 + nameW + 18, 198);

  // Portrait.
  const px = 60;
  const py = 250;
  const pw = CARD_W - 120;
  const ph = 660;
  ctx.save();
  rounded(ctx, px, py, pw, ph, 44);
  ctx.clip();
  drawBackdrop(ctx, CARD_W, CARD_H);
  if (info.portrait) {
    const s = Math.max(pw / info.portrait.width, ph / info.portrait.height);
    const w = info.portrait.width * s;
    const h = info.portrait.height * s;
    ctx.drawImage(info.portrait, px + (pw - w) / 2, py + (ph - h) / 2, w, h);
  }
  ctx.restore();

  // Facts: species, personality, age, bond.
  const chips = [SPECIES_WORD[info.species], PERSONALITY_WORD[info.personality], ageText(info.bornAt, info.now)];
  if (info.bond) chips.push(info.you ? `${info.bond} with ${info.you}` : info.bond);
  ctx.font = `600 34px ${FONT}`;
  let cx = 60;
  let cy = 950;
  for (const c of chips) {
    const w = ctx.measureText(c).width + 48;
    if (cx + w > CARD_W - 60) {
      cx = 60;
      cy += 72;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rounded(ctx, cx, cy, w, 58, 29);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(c, cx + 24, cy + 40);
    cx += w + 14;
  }

  // A favourite thing it said.
  if (info.quote) {
    ctx.font = `500 40px ${FONT}`;
    const lines = wrap(ctx, info.quote, CARD_W - 200, 3);
    const qy = cy + 100;
    const qh = 48 + lines.length * 52;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    rounded(ctx, 60, qy, CARD_W - 120, qh, 36);
    ctx.fill();
    ctx.fillStyle = '#16181f';
    lines.forEach((l, i) => ctx.fillText(l, 100, qy + 62 + i * 52));
  }

  // Where it lives.
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText('WebPets', CARD_W - 60, CARD_H - 50);
  ctx.textAlign = 'left';
}

/** The card as PNG bytes. */
export async function petCardPng(info: PetCardInfo): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas');
  drawPetCard(ctx, info);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('could not make the card');
  return new Uint8Array(await blob.arrayBuffer());
}

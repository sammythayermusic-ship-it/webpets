// Audio hooks (Howler). Every file is optional: assets/audio/<species>/{ambient,feed,alert,death}.ogg.
// A missing file logs once and the sound becomes a no-op, so the app runs with no audio assets at all.

import { Howl, Howler } from 'howler';
import type { Species } from '../sim/types';
import type { AudioApi, SfxName } from '../ui/types';

const AMBIENT_VOLUME = 0.4;
const SFX_VOLUME = 0.8;

function audioUrl(species: Species, name: SfxName | 'ambient'): string {
  return `/audio/${species}/${name}.ogg`;
}

export function initAudio(): AudioApi {
  const failed = new Set<string>();
  const sfx = new Map<string, Howl>();
  let ambient: { species: Species; howl: Howl } | null = null;
  let species: Species = 'fish';

  function load(src: string, loop: boolean): Howl | null {
    if (failed.has(src)) return null;
    try {
      const howl: Howl = new Howl({
        src: [src],
        loop,
        preload: true,
        html5: false,
        volume: loop ? AMBIENT_VOLUME : SFX_VOLUME,
        onloaderror: (_id, err) => {
          if (!failed.has(src)) {
            failed.add(src);
            console.info(`[audio] optional file unavailable, muting it: ${src}`, err);
          }
          sfx.delete(src);
          if (ambient && ambient.howl === howl) ambient = null;
          try {
            howl.unload();
          } catch {
            /* already gone */
          }
        },
        onplayerror: (_id, err) => {
          // Autoplay policy before the first user gesture; Howler retries after unlock on its own.
          console.info(`[audio] play blocked for ${src}`, err);
        },
      });
      return howl;
    } catch (err) {
      failed.add(src);
      console.info(`[audio] could not create sound ${src}`, err);
      return null;
    }
  }

  function play(name: SfxName): void {
    const src = audioUrl(species, name);
    let howl = sfx.get(src);
    if (!howl) {
      const created = load(src, false);
      if (!created) return;
      howl = created;
      sfx.set(src, howl);
    }
    try {
      // Howler queues play() until the file has loaded, so a first-time call is fine.
      howl.play();
    } catch (err) {
      console.info(`[audio] play failed for ${src}`, err);
    }
  }

  function setAmbient(next: Species, on: boolean): void {
    species = next;
    if (!on) {
      if (ambient) {
        try {
          ambient.howl.stop();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (ambient && ambient.species === next) {
      try {
        if (!ambient.howl.playing()) ambient.howl.play();
      } catch {
        /* ignore */
      }
      return;
    }
    if (ambient) {
      try {
        ambient.howl.unload();
      } catch {
        /* ignore */
      }
      ambient = null;
    }
    const howl = load(audioUrl(next, 'ambient'), true);
    if (!howl) return;
    ambient = { species: next, howl };
    try {
      howl.play();
    } catch {
      /* ignore */
    }
  }

  function setMuted(b: boolean): void {
    try {
      Howler.mute(b);
    } catch {
      /* no audio context (e.g. tests) */
    }
  }

  return { play, setAmbient, setMuted };
}

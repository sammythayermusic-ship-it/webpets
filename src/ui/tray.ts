// Tray wiring: TrayAction -> store actions, chip repaint on hunger-label/alive/phase change,
// setMenuState on settings/hidden/alive change, tooltip "<name> · <label> · <pct>%".

import type { AppState } from '../app/types';
import type { TrayAction, TrayMenuState } from '../platform/types';
import { SCALE_L, SCALE_M, SCALE_S, type TrayChipSize } from '../sim/constants';
import { paintTrayChip } from '../render';
import type { DevPanelHandle, UiDeps } from './types';
import { prefersReducedMotion } from './dom';
import { toChipView, toHudModel, tooltipText } from './model';

export interface TrayDeps extends UiDeps {
  devPanel: Pick<DevPanelHandle, 'toggle'>;
  feederDialog: { open(): void };
}

export function chipSizeFor(devicePixelRatio: number): TrayChipSize {
  return devicePixelRatio >= 2 ? 36 : 18;
}

function logRejected(what: string): (err: unknown) => void {
  return (err) => console.warn(`[tray] ${what} failed`, err);
}

export function wireTray(deps: TrayDeps): () => void {
  const { store, platform } = deps;

  function toggleVisibility(): void {
    const s = store.getState();
    s.actions.setHidden(!s.hidden).catch(logRejected('setHidden'));
  }

  function ensureShown(): void {
    const s = store.getState();
    if (s.hidden) s.actions.setHidden(false).catch(logRejected('setHidden'));
  }

  function onAction(action: TrayAction): void {
    const s = store.getState();
    const a = s.actions;
    switch (action) {
      case 'feed':
        a.feed();
        return;
      case 'pantry':
        ensureShown();
        deps.feederDialog.open();
        return;
      case 'size-s':
        a.setScale(SCALE_S).catch(logRejected('setScale'));
        return;
      case 'size-m':
        a.setScale(SCALE_M).catch(logRejected('setScale'));
        return;
      case 'size-l':
        a.setScale(SCALE_L).catch(logRejected('setScale'));
        return;
      case 'mute':
        a.setMuted(!s.settings.muted);
        return;
      case 'notifications':
        a.setNotificationsMuted(!s.settings.notificationsMuted);
        return;
      case 'talk':
        a.setTalkMuted(!s.settings.talkMuted);
        return;
      case 'daynight-auto':
        a.setDayNight('auto');
        return;
      case 'daynight-day':
        a.setDayNight('day');
        return;
      case 'daynight-night':
        a.setDayNight('night');
        return;
      case 'always-on-top':
        a.setLayering({ alwaysOnTop: !s.settings.alwaysOnTop }).catch(logRejected('setLayering'));
        return;
      case 'all-desktops':
        a.setLayering({ allDesktops: !s.settings.allDesktops }).catch(logRejected('setLayering'));
        return;
      case 'over-fullscreen':
        a.setLayering({ overFullscreen: !s.settings.overFullscreen }).catch(logRejected('setLayering'));
        return;
      case 'launch-at-login':
        a.setLaunchAtLogin(!s.settings.launchAtLogin).catch(logRejected('setLaunchAtLogin'));
        return;
      case 'dev-panel':
        ensureShown();
        deps.devPanel.toggle();
        return;
      case 'new-pet':
        a.newPet();
        return;
      case 'toggle-visibility':
        toggleVisibility();
        return;
      case 'quit':
        a.quit().catch(logRejected('quit'));
        return;
    }
  }

  const offAction = platform.tray.onAction(onAction);
  const offToggle = platform.onToggleVisibility(toggleVisibility);

  let chipKey = '';
  let tooltip = '';
  let menuKey = '';
  let muted: boolean | null = null;

  function sync(s: AppState): void {
    const view = toChipView(s, prefersReducedMotion());
    const dpr = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const size = chipSizeFor(dpr);
    const key = `${view.species}|${view.label}|${view.alive}|${view.phase}|${size}`;
    if (key !== chipKey) {
      chipKey = key;
      try {
        const rgba = paintTrayChip(view, size);
        platform.tray.setChip(rgba, size).catch(logRejected('setChip'));
      } catch (err) {
        console.warn('[tray] paintTrayChip failed', err);
      }
    }

    const tip = tooltipText(toHudModel(s, s.actions.now()));
    if (tip !== tooltip) {
      tooltip = tip;
      platform.tray.setTooltip(tip).catch(logRejected('setTooltip'));
    }

    const menu: TrayMenuState = {
      scale: s.settings.scale,
      muted: s.settings.muted,
      notificationsMuted: s.settings.notificationsMuted,
      talkMuted: s.settings.talkMuted,
      dayNight: s.settings.dayNight,
      launchAtLogin: s.settings.launchAtLogin,
    alwaysOnTop: s.settings.alwaysOnTop,
    allDesktops: s.settings.allDesktops,
    overFullscreen: s.settings.overFullscreen,
      alive: s.pet.alive,
      hidden: s.hidden,
    };
    const mk = JSON.stringify(menu);
    if (mk !== menuKey) {
      menuKey = mk;
      platform.tray.setMenuState(menu).catch(logRejected('setMenuState'));
    }

    if (muted !== s.settings.muted) {
      muted = s.settings.muted;
      deps.audio.setMuted(muted);
    }
  }

  const unsub = store.subscribe(sync);
  sync(store.getState());

  return () => {
    offAction();
    offToggle();
    unsub();
  };
}

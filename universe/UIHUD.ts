export type HudPanel = 'missions' | 'economy' | 'dialogue' | 'construction' | null;

export interface HudMission {
  id?: string;
  title: string;
  status?: string;
  objective?: string;
  reward?: number;
  progress?: number;
}

export interface HudMarketItem {
  id?: string;
  marketId?: string;
  commodity: string;
  price: number;
  trend?: number;
  supply?: number;
}

export interface HudDialogueLine {
  id?: string;
  speaker: string;
  text: string;
  choices?: Array<{ id: string; text: string }>;
}

export interface HudConstructionProject {
  id: string;
  name: string;
  status?: string;
  progress?: number;
  description?: string;
}

export interface HudSnapshot {
  zone?: string;
  location?: string;
  objective?: string;
  contextPrompt?: string;
  speed?: number;
  oxygen?: number;
  pressure?: number;
  integrity?: number;
  credits?: number;
  worldTime?: string | number;
  npcCount?: number;
  agentCount?: number;
  missionCount?: number;
  flightMode?: boolean;
  magneticBoots?: boolean;
  suited?: boolean;
  alarm?: boolean;
  saveStatus?: string;
  missions?: HudMission[];
  market?: HudMarketItem[];
  dialogue?: HudDialogueLine[];
  construction?: Array<string | HudConstructionProject>;
}

export interface HudActions {
  interact?: () => void;
  togglePanel?: (panel: HudPanel) => void;
  save?: () => void;
  load?: () => void;
  toggleAudio?: () => void;
  toggleFullscreen?: () => void;
  toggleConsole?: () => void;
  requestPointerLock?: () => void;
  acceptMission?: (missionId: string) => void;
  trade?: (marketId: string, commodityId: string, side: 'buy' | 'sell', quantity: number) => void;
  chooseDialogue?: (choiceId: string) => void;
  constructionAction?: (projectId: string, action: 'start' | 'work') => void;
}

export interface MobileInputState {
  forward: number;
  right: number;
  ascend: number;
  boost: boolean;
}

const STYLE_ID = 'snapkitty-universe-runtime-styles';

/** DOM-backed HUD kept separate from simulation and rendering. */
export class UIHUD {
  private readonly root: HTMLElement;
  private actions: HudActions = {};
  private activePanel: HudPanel = null;
  private snapshot: HudSnapshot = {};
  private toastTimer = 0;
  private mobileInput: MobileInputState = { forward: 0, right: 0, ascend: 0, boost: false };
  private lookDelta = { x: 0, y: 0 };
  private lookPointer: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private readonly cleanup: Array<() => void> = [];

  public constructor(root: HTMLElement) {
    this.root = root;
    this.installStyles();
    this.ensureMarkup();
    this.bindStaticControls();
    this.bindMobileControls();
    this.update({});
  }

  public bindActions(actions: HudActions): void {
    this.actions = actions;
  }

  public update(next: HudSnapshot): void {
    this.snapshot = { ...this.snapshot, ...next };
    const snapshot = this.snapshot;
    this.setText('#hud-location', (snapshot.location ?? snapshot.zone ?? 'Sovereign Atrium').toUpperCase());
    this.setText('#hud-objective', snapshot.objective ?? 'Explore the station and reach the exterior airlock');
    this.setText('#hud-speed', `${(snapshot.speed ?? 0).toFixed(1)} m/s`);
    this.setText('#hud-oxygen', `${Math.round(snapshot.oxygen ?? 100)}%`);
    this.setText('#hud-pressure', `${Math.round(snapshot.pressure ?? 101)} kPa`);
    this.setText('#hud-integrity', `${Math.round(snapshot.integrity ?? 100)}%`);
    this.setText('#hud-credits', this.formatCredits(snapshot.credits ?? 2480));
    this.setText('#hud-time', this.formatTime(snapshot.worldTime));
    this.setText('#hud-population', `${snapshot.npcCount ?? 50} / ${snapshot.agentCount ?? 12}`);
    this.setText('#hud-mission-count', String(snapshot.missionCount ?? snapshot.missions?.length ?? 10));
    this.setText('#hud-save-status', snapshot.saveStatus ?? 'LIVE');

    const prompt = this.root.querySelector<HTMLElement>('#context-prompt');
    if (prompt) {
      const promptText = snapshot.contextPrompt?.trim() ?? '';
      prompt.hidden = promptText.length === 0;
      const label = prompt.querySelector<HTMLElement>('[data-prompt-label]');
      if (label) label.textContent = promptText;
    }

    this.toggleClass('#hud-status', 'is-alarm', Boolean(snapshot.alarm));
    this.toggleClass('#hud-flight', 'is-active', Boolean(snapshot.flightMode));
    this.toggleClass('#hud-boots', 'is-active', Boolean(snapshot.magneticBoots));
    this.toggleClass('#hud-suit', 'is-active', Boolean(snapshot.suited));
    this.renderPanelContents();
  }

  public showPanel(panel: HudPanel): void {
    this.activePanel = panel;
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-hud-panel]')) {
      const isOpen = panel !== null && element.dataset.hudPanel === panel;
      element.hidden = !isOpen;
      element.setAttribute('aria-hidden', String(!isOpen));
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-panel]')) {
      button.classList.toggle('is-active', button.dataset.panel === panel);
      button.setAttribute('aria-pressed', String(button.dataset.panel === panel));
    }
    if (panel) this.renderPanelContents();
  }

  public togglePanel(panel: Exclude<HudPanel, null>): void {
    const next = this.activePanel === panel ? null : panel;
    this.showPanel(next);
    this.actions.togglePanel?.(next);
  }

  public toast(message: string, tone: 'info' | 'success' | 'warning' = 'info'): void {
    const region = this.root.querySelector<HTMLElement>('#toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `universe-toast is-${tone}`;
    item.setAttribute('role', 'status');
    item.textContent = message;
    region.replaceChildren(item);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => item.remove(), 3400);
  }

  public getMobileInput(): Readonly<MobileInputState> {
    return this.mobileInput;
  }

  public consumeLookDelta(): { x: number; y: number } {
    const delta = { ...this.lookDelta };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return delta;
  }

  public dispose(): void {
    window.clearTimeout(this.toastTimer);
    for (const remove of this.cleanup) remove();
    this.cleanup.length = 0;
  }

  private installStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: 0; }
      * { box-sizing: border-box; }
      html, body, #app { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #030408; }
      button, input { font: inherit; letter-spacing: 0; }
      button { -webkit-tap-highlight-color: transparent; }
      #viewport { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden; background: #030408; }
      #viewport canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: 0; }
      #universe-hud { position: fixed; inset: 0; z-index: 10; pointer-events: none; color: #f4f8fb; font-size: 12px; }
      .hud-frame { position: absolute; inset: 14px; border: 1px solid rgba(72,226,238,.22); clip-path: polygon(0 0, 34px 0, 42px 8px, calc(100% - 42px) 8px, calc(100% - 34px) 0, 100% 0, 100% 100%, calc(100% - 8px) 100%, calc(100% - 8px) calc(100% - 16px), 8px calc(100% - 16px), 8px 100%, 0 100%); opacity: .55; }
      #hud-status { position: absolute; top: 22px; left: 24px; right: 24px; height: 52px; display: grid; grid-template-columns: minmax(210px, 1fr) auto minmax(230px, 1fr); align-items: start; gap: 16px; }
      .hud-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .hud-sigil { width: 32px; height: 32px; border: 1px solid #f1bd49; position: relative; transform: rotate(45deg); box-shadow: inset 0 0 0 4px #05070c, inset 0 0 0 5px rgba(241,189,73,.34); }
      .hud-sigil::before, .hud-sigil::after { content: ''; position: absolute; background: #f1bd49; }
      .hud-sigil::before { width: 12px; height: 1px; left: 5px; top: 10px; }
      .hud-sigil::after { width: 1px; height: 12px; left: 10px; top: 5px; }
      .hud-brand-copy { min-width: 0; }
      .hud-brand-name { font-family: 'Arial Narrow', Inter, sans-serif; color: #fff; font-weight: 800; font-size: 15px; line-height: 1; white-space: nowrap; }
      .hud-brand-sub { color: #6fe8ee; font-size: 9px; text-transform: uppercase; margin-top: 5px; white-space: nowrap; }
      .hud-location { justify-self: center; min-width: 0; text-align: center; border-top: 1px solid rgba(111,232,238,.7); padding: 7px 30px 0; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; }
      .hud-location::before { content: 'LOCAL // '; color: #6fe8ee; }
      .hud-status-right { display: flex; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
      .hud-chip { height: 26px; min-width: 62px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid rgba(255,255,255,.2); background: rgba(3,5,10,.74); color: #aab6c3; padding: 0 9px; font-size: 9px; text-transform: uppercase; }
      .hud-chip b { color: #fff; font-size: 10px; }
      .hud-chip.is-active { color: #6fe8ee; border-color: rgba(111,232,238,.62); }
      #hud-status.is-alarm .hud-chip { border-color: rgba(255,58,140,.72); }
      .hud-objective { position: absolute; left: 24px; top: 90px; width: min(370px, calc(100vw - 48px)); border-left: 2px solid #f1bd49; padding: 9px 12px; background: rgba(3,5,10,.72); color: #d8e0e8; }
      .hud-kicker { display: block; color: #f1bd49; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; }
      #crosshair { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; transform: translate(-50%,-50%); pointer-events: none; z-index: 8; }
      #crosshair::before, #crosshair::after { content: ''; position: absolute; background: rgba(255,255,255,.84); box-shadow: 0 0 7px rgba(111,232,238,.6); }
      #crosshair::before { width: 18px; height: 1px; left: 6px; top: 14px; }
      #crosshair::after { width: 1px; height: 18px; left: 14px; top: 6px; }
      #crosshair i { position: absolute; inset: 11px; border: 1px solid #6fe8ee; border-radius: 50%; }
      #context-prompt { position: absolute; left: 50%; top: calc(50% + 38px); transform: translateX(-50%); display: flex; align-items: center; gap: 9px; max-width: min(420px, calc(100vw - 36px)); background: rgba(3,5,10,.9); border: 1px solid rgba(111,232,238,.52); padding: 8px 13px; color: #edf8fa; text-align: center; }
      .context-icon { display: inline-grid; place-items: center; min-width: 22px; height: 22px; border: 1px solid #f1bd49; color: #f1bd49; background: #090b10; }
      .context-icon svg, .mobile-pad svg, .mobile-actions svg { width: 17px; height: 17px; stroke: currentColor; fill: none; stroke-width: 1.7; }
      .hud-telemetry { position: absolute; left: 24px; bottom: 30px; display: grid; grid-template-columns: repeat(4, minmax(74px, 1fr)); gap: 1px; width: min(410px, calc(100vw - 48px)); background: rgba(111,232,238,.16); }
      .hud-reading { min-height: 48px; padding: 8px 10px; background: rgba(3,5,10,.84); }
      .hud-reading span { display: block; color: #7e8c99; font-size: 8px; text-transform: uppercase; }
      .hud-reading strong { display: block; color: #fff; font-size: 13px; margin-top: 4px; }
      .hud-commandbar { position: absolute; right: 24px; bottom: 30px; display: flex; align-items: center; gap: 4px; pointer-events: auto; }
      .hud-icon-button { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.22); border-radius: 2px; background: rgba(3,5,10,.86); color: #bac5cf; cursor: pointer; }
      .hud-icon-button:hover, .hud-icon-button:focus-visible, .hud-icon-button.is-active { border-color: #6fe8ee; color: #fff; background: rgba(7,19,24,.94); outline: 0; }
      .hud-icon-button svg { width: 17px; height: 17px; stroke: currentColor; fill: none; stroke-width: 1.6; }
      .hud-mini { min-width: 62px; height: 38px; padding: 0 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(3,5,10,.86); color: #8795a3; font-size: 8px; text-transform: uppercase; }
      .hud-mini b { display: block; color: #fff; font-size: 10px; margin-top: 2px; }
      .hud-panel { position: absolute; top: 92px; right: 24px; bottom: 82px; width: min(380px, calc(100vw - 48px)); overflow: auto; pointer-events: auto; border: 1px solid rgba(111,232,238,.3); border-top: 2px solid #6fe8ee; background: rgba(4,7,12,.96); box-shadow: 0 20px 60px rgba(0,0,0,.45); }
      .hud-panel[hidden] { display: none; }
      .hud-panel-head { position: sticky; top: 0; z-index: 1; min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.1); background: #070a10; }
      .hud-panel-head h2 { margin: 0; font-size: 12px; text-transform: uppercase; color: #fff; }
      .hud-panel-body { padding: 10px; }
      .hud-list-item { padding: 11px 10px; border-bottom: 1px solid rgba(255,255,255,.08); color: #c8d2db; }
      .hud-list-item:last-child { border-bottom: 0; }
      .hud-list-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
      .hud-list-title { color: #fff; font-weight: 700; }
      .hud-list-meta { color: #6fe8ee; font: 10px/1.2 monospace; white-space: nowrap; }
      .hud-list-copy { margin-top: 6px; color: #8493a0; line-height: 1.45; font-size: 10px; }
      .hud-progress { height: 2px; margin-top: 9px; background: #161d24; overflow: hidden; }
      .hud-progress i { display: block; height: 100%; background: #f1bd49; }
      .hud-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
      .hud-action { min-height: 30px; border: 1px solid rgba(111,232,238,.42); border-radius: 2px; background: #080d13; color: #dffafd; padding: 0 10px; cursor: pointer; font-size: 9px; text-transform: uppercase; }
      .hud-action:hover, .hud-action:focus-visible { border-color: #f1bd49; color: #fff; outline: 0; }
      .hud-action[disabled] { opacity: .42; cursor: default; }
      .hud-trend-up { color: #71f1bd; }
      .hud-trend-down { color: #ff3a8c; }
      .dialogue-speaker { color: #f1bd49; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; }
      #toast-region { position: absolute; top: 90px; left: 50%; width: min(420px, calc(100vw - 40px)); transform: translateX(-50%); }
      .universe-toast { padding: 10px 14px; text-align: center; background: rgba(3,5,10,.94); border-left: 2px solid #6fe8ee; color: #e7eef3; }
      .universe-toast.is-success { border-color: #71f1bd; }
      .universe-toast.is-warning { border-color: #ff3a8c; }
      #mobile-controls { display: none; }
      .sr-only { position: absolute!important; width: 1px!important; height: 1px!important; overflow: hidden!important; clip: rect(0,0,0,0)!important; white-space: nowrap!important; }
      @media (max-width: 760px) {
        .hud-frame { inset: 8px; }
        #hud-status { top: 14px; left: 15px; right: 15px; grid-template-columns: 1fr auto; height: auto; }
        .hud-location { order: 3; grid-column: 1 / -1; justify-self: stretch; padding: 6px 0 0; text-align: left; }
        .hud-status-right .hud-chip:nth-child(n+3) { display: none; }
        .hud-objective { top: 91px; left: 15px; width: calc(100vw - 30px); }
        .hud-telemetry { left: 15px; bottom: 142px; width: calc(100vw - 30px); grid-template-columns: repeat(4, 1fr); }
        .hud-reading { min-width: 0; padding: 6px; }
        .hud-reading strong { font-size: 11px; }
        .hud-commandbar { top: 141px; right: 15px; bottom: auto; }
        .hud-commandbar .hud-mini { display: none; }
        .hud-panel { top: 188px; right: 15px; left: 15px; bottom: 136px; width: auto; }
      }
      @media (pointer: coarse), (hover: none) {
        #mobile-controls { position: absolute; inset: 0; display: block; pointer-events: none; touch-action: none; }
        .mobile-pad { position: absolute; bottom: 24px; width: 118px; height: 104px; pointer-events: auto; touch-action: none; }
        .mobile-pad-left { left: 18px; }
        .mobile-look { right: 18px; border: 1px solid rgba(111,232,238,.23); background: rgba(3,5,10,.24); }
        .mobile-pad button, .mobile-actions button { position: absolute; display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid rgba(255,255,255,.3); border-radius: 50%; background: rgba(3,5,10,.72); color: #fff; pointer-events: auto; touch-action: none; }
        .mobile-pad button.is-pressed, .mobile-actions button.is-pressed { border-color: #6fe8ee; background: rgba(10,43,48,.9); }
        [data-mobile='forward'] { left: 40px; top: 0; }
        [data-mobile='back'] { left: 40px; bottom: 0; }
        [data-mobile='left'] { left: 0; top: 34px; }
        [data-mobile='right'] { right: 0; top: 34px; }
        .mobile-look-label { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255,255,255,.48); }
        .mobile-actions { position: absolute; right: 150px; bottom: 22px; width: 92px; height: 132px; pointer-events: none; }
        .mobile-actions button { width: 42px; height: 42px; }
        [data-mobile='action'] { right: 0; bottom: 0; border-color: rgba(241,189,73,.72)!important; color: #f1bd49!important; }
        [data-mobile='ascend'] { right: 0; top: 0; }
        [data-mobile='descend'] { left: 0; top: 44px; }
        [data-mobile='boost'] { right: 0; top: 44px; color: #ff63a5!important; }
      }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto!important; transition: none!important; animation: none!important; } }
    `;
    document.head.append(style);
  }

  private ensureMarkup(): void {
    let hud = this.root.querySelector<HTMLElement>('#universe-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'universe-hud';
      this.root.append(hud);
    }
    hud.innerHTML = `
      <div class="hud-frame" aria-hidden="true"></div>
      <header id="hud-status">
        <div class="hud-brand"><span class="hud-sigil" aria-hidden="true"></span><div class="hud-brand-copy"><div class="hud-brand-name">SNAPKITTY UNIVERSE</div><div class="hud-brand-sub">Sovereign orbital continuum</div></div></div>
        <div class="hud-location" id="hud-location"></div>
        <div class="hud-status-right"><span class="hud-chip" id="hud-suit">SUIT <b>READY</b></span><span class="hud-chip" id="hud-boots">MAG <b>AUTO</b></span><span class="hud-chip" id="hud-flight">NAV <b>LOCAL</b></span></div>
      </header>
      <section class="hud-objective"><span class="hud-kicker">Active directive</span><span id="hud-objective"></span></section>
      <div id="context-prompt" hidden><span class="context-icon" title="Interact"><i data-lucide="hand" aria-hidden="true"></i></span><span data-prompt-label></span></div>
      <div id="toast-region" aria-live="polite"></div>
      <section class="hud-telemetry" aria-label="Suit telemetry">
        <div class="hud-reading"><span>Velocity</span><strong id="hud-speed"></strong></div>
        <div class="hud-reading"><span>Oxygen</span><strong id="hud-oxygen"></strong></div>
        <div class="hud-reading"><span>Pressure</span><strong id="hud-pressure"></strong></div>
        <div class="hud-reading"><span>Integrity</span><strong id="hud-integrity"></strong></div>
      </section>
      <nav class="hud-commandbar" aria-label="Universe systems">
        <div class="hud-mini">Population<b id="hud-population"></b></div><div class="hud-mini">Credits<b id="hud-credits"></b></div><div class="hud-mini">Cycle<b id="hud-time"></b></div>
        ${this.iconButton('missions', 'Missions', 'list-checks')}
        ${this.iconButton('economy', 'Economy', 'chart-no-axes-combined')}
        ${this.iconButton('dialogue', 'Comms', 'message-square')}
        ${this.iconButton('construction', 'Construction', 'hammer')}
        ${this.iconButton('console', 'Developer console', 'terminal')}
        ${this.iconButton('save', 'Save universe', 'save')}
        ${this.iconButton('load', 'Load universe', 'folder-open')}
        ${this.iconButton('audio', 'Toggle audio', 'volume-2')}
        ${this.iconButton('fullscreen', 'Toggle fullscreen', 'maximize')}
        <div class="hud-mini">State<b id="hud-save-status"></b></div><span class="sr-only" id="hud-mission-count"></span>
      </nav>
      ${this.panel('missions', 'Mission lattice')}
      ${this.panel('economy', 'Local exchange')}
      ${this.panel('dialogue', 'Sovereign communications')}
      ${this.panel('construction', 'Owned-space fabricator')}
      <div id="mobile-controls" aria-label="Touch controls">
        <div class="mobile-pad mobile-pad-left"><button data-mobile="forward" aria-label="Move forward" title="Move forward"><i data-lucide="arrow-up" aria-hidden="true"></i></button><button data-mobile="left" aria-label="Strafe left" title="Strafe left"><i data-lucide="arrow-left" aria-hidden="true"></i></button><button data-mobile="right" aria-label="Strafe right" title="Strafe right"><i data-lucide="arrow-right" aria-hidden="true"></i></button><button data-mobile="back" aria-label="Move backward" title="Move backward"><i data-lucide="arrow-down" aria-hidden="true"></i></button></div>
        <div class="mobile-pad mobile-look" data-mobile="look" aria-label="Drag to look" title="Drag to look"><span class="mobile-look-label"><i data-lucide="scan" aria-hidden="true"></i></span></div>
        <div class="mobile-actions"><button data-mobile="ascend" aria-label="Ascend" title="Ascend"><i data-lucide="arrow-up" aria-hidden="true"></i></button><button data-mobile="descend" aria-label="Descend" title="Descend"><i data-lucide="arrow-down" aria-hidden="true"></i></button><button data-mobile="boost" aria-label="Boost" title="Boost"><i data-lucide="chevrons-up" aria-hidden="true"></i></button><button data-mobile="action" aria-label="Interact" title="Interact"><i data-lucide="hand" aria-hidden="true"></i></button></div>
      </div>
    `;
  }

  private iconButton(action: string, label: string, icon: string): string {
    const panel = ['missions', 'economy', 'dialogue', 'construction'].includes(action) ? ` data-panel="${action}"` : '';
    return `<button class="hud-icon-button" data-action="${action}"${panel} type="button" aria-label="${label}" title="${label}"><i data-lucide="${icon}" aria-hidden="true"></i></button>`;
  }

  private panel(name: string, title: string): string {
    return `<section class="hud-panel" id="${name === 'missions' ? 'mission' : name}-panel" data-hud-panel="${name}" hidden aria-hidden="true"><header class="hud-panel-head"><h2>${title}</h2><button class="hud-icon-button" data-action="close" type="button" aria-label="Close panel" title="Close"><i data-lucide="x" aria-hidden="true"></i></button></header><div class="hud-panel-body" data-panel-body></div></section>`;
  }

  private bindStaticControls(): void {
    const onClick = (event: Event): void => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-action], [data-hud-command]');
      if (!button || !this.root.contains(button)) return;
      const action = button.dataset.action;
      if (action === 'missions' || action === 'economy' || action === 'dialogue' || action === 'construction') this.togglePanel(action);
      else if (action === 'close') this.showPanel(null);
      else if (action === 'save') this.actions.save?.();
      else if (action === 'load') this.actions.load?.();
      else if (action === 'audio') this.actions.toggleAudio?.();
      else if (action === 'fullscreen') this.actions.toggleFullscreen?.();
      else if (action === 'console') this.actions.toggleConsole?.();
      else if (action === 'interact') this.actions.interact?.();
      const command = button.dataset.hudCommand;
      if (command === 'accept-mission' && button.dataset.id) this.actions.acceptMission?.(button.dataset.id);
      else if ((command === 'buy' || command === 'sell') && button.dataset.marketId && button.dataset.id) this.actions.trade?.(button.dataset.marketId, button.dataset.id, command, 1);
      else if (command === 'dialogue-choice' && button.dataset.id) this.actions.chooseDialogue?.(button.dataset.id);
      else if ((command === 'construction-start' || command === 'construction-work') && button.dataset.id) this.actions.constructionAction?.(button.dataset.id, command === 'construction-start' ? 'start' : 'work');
    };
    this.root.addEventListener('click', onClick);
    this.cleanup.push(() => this.root.removeEventListener('click', onClick));
  }

  private bindMobileControls(): void {
    const directions: Record<string, Partial<MobileInputState>> = {
      forward: { forward: 1 }, back: { forward: -1 }, left: { right: -1 }, right: { right: 1 },
      ascend: { ascend: 1 }, descend: { ascend: -1 }, boost: { boost: true },
    };
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-mobile]')) {
      const key = button.dataset.mobile ?? '';
      if (key === 'look' || key === 'action') continue;
      const patch = directions[key];
      if (!patch) continue;
      const start = (event: PointerEvent): void => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        button.classList.add('is-pressed');
        Object.assign(this.mobileInput, patch);
      };
      const end = (event: PointerEvent): void => {
        event.preventDefault();
        button.classList.remove('is-pressed');
        if ('forward' in patch) this.mobileInput.forward = 0;
        if ('right' in patch) this.mobileInput.right = 0;
        if ('ascend' in patch) this.mobileInput.ascend = 0;
        if ('boost' in patch) this.mobileInput.boost = false;
      };
      button.addEventListener('pointerdown', start);
      button.addEventListener('pointerup', end);
      button.addEventListener('pointercancel', end);
      this.cleanup.push(() => button.removeEventListener('pointerdown', start), () => button.removeEventListener('pointerup', end), () => button.removeEventListener('pointercancel', end));
    }
    const action = this.root.querySelector<HTMLButtonElement>('[data-mobile="action"]');
    if (action) {
      const invoke = (event: PointerEvent): void => { event.preventDefault(); this.actions.interact?.(); };
      action.addEventListener('pointerdown', invoke);
      this.cleanup.push(() => action.removeEventListener('pointerdown', invoke));
    }
    const look = this.root.querySelector<HTMLElement>('[data-mobile="look"]');
    if (look) {
      const start = (event: PointerEvent): void => {
        event.preventDefault();
        this.lookPointer = event.pointerId;
        this.lastLook = { x: event.clientX, y: event.clientY };
        look.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent): void => {
        if (this.lookPointer !== event.pointerId) return;
        event.preventDefault();
        this.lookDelta.x += event.clientX - this.lastLook.x;
        this.lookDelta.y += event.clientY - this.lastLook.y;
        this.lastLook = { x: event.clientX, y: event.clientY };
      };
      const end = (event: PointerEvent): void => { if (this.lookPointer === event.pointerId) this.lookPointer = null; };
      look.addEventListener('pointerdown', start);
      look.addEventListener('pointermove', move);
      look.addEventListener('pointerup', end);
      look.addEventListener('pointercancel', end);
      this.cleanup.push(() => look.removeEventListener('pointerdown', start), () => look.removeEventListener('pointermove', move), () => look.removeEventListener('pointerup', end), () => look.removeEventListener('pointercancel', end));
    }
  }

  private renderPanelContents(): void {
    if (!this.activePanel) return;
    const panel = this.root.querySelector<HTMLElement>(`[data-hud-panel="${this.activePanel}"] [data-panel-body]`);
    if (!panel) return;
    panel.replaceChildren();
    if (this.activePanel === 'missions') this.renderMissions(panel);
    else if (this.activePanel === 'economy') this.renderMarket(panel);
    else if (this.activePanel === 'dialogue') this.renderDialogue(panel);
    else if (this.activePanel === 'construction') this.renderConstruction(panel);
  }

  private renderMissions(panel: HTMLElement): void {
    const missions = this.snapshot.missions ?? [];
    for (const mission of missions) {
      const item = this.listItem(mission.title, `${mission.status ?? 'AVAILABLE'}${mission.reward ? ` · ${this.formatCredits(mission.reward)}` : ''}`, mission.objective ?? 'Objective updates from persistent world state.');
      const progress = document.createElement('div');
      progress.className = 'hud-progress';
      const value = document.createElement('i');
      value.style.width = `${Math.max(0, Math.min(100, mission.progress ?? 0))}%`;
      progress.append(value);
      item.append(progress);
      if (mission.id && (mission.status ?? '').toLowerCase() === 'available') {
        item.append(this.commandButtons([{ command: 'accept-mission', id: mission.id, label: 'Accept contract' }]));
      }
      panel.append(item);
    }
    if (missions.length === 0) panel.append(this.listItem('Mission lattice synchronizing', 'LIVE', 'Contracts are generated from station, economy, and faction state.'));
  }

  private renderMarket(panel: HTMLElement): void {
    const market = this.snapshot.market ?? [];
    for (const entry of market) {
      const trend = entry.trend ?? 0;
      const item = this.listItem(entry.commodity, `${entry.price.toFixed(1)} CR`, `Supply index ${Math.round(entry.supply ?? 100)}`);
      const meta = item.querySelector<HTMLElement>('.hud-list-meta');
      if (meta) {
        meta.textContent += ` ${trend >= 0 ? '▲' : '▼'}${Math.abs(trend).toFixed(1)}%`;
        meta.classList.add(trend >= 0 ? 'hud-trend-up' : 'hud-trend-down');
      }
      if (entry.id && entry.marketId) item.append(this.commandButtons([
        { command: 'buy', id: entry.id, marketId: entry.marketId, label: 'Buy 1' },
        { command: 'sell', id: entry.id, marketId: entry.marketId, label: 'Sell 1' },
      ]));
      panel.append(item);
    }
    if (market.length === 0) panel.append(this.listItem('Orbital exchange', 'OPEN', 'Commodity prices respond to production, consumption, cargo traffic, and faction sanctions.'));
  }

  private renderDialogue(panel: HTMLElement): void {
    const lines = this.snapshot.dialogue ?? [];
    for (const line of lines) {
      const item = document.createElement('article');
      item.className = 'hud-list-item';
      const speaker = document.createElement('div');
      speaker.className = 'dialogue-speaker';
      speaker.textContent = line.speaker;
      const copy = document.createElement('div');
      copy.className = 'hud-list-copy';
      copy.textContent = line.text;
      item.append(speaker, copy);
      if (line.choices?.length) item.append(this.commandButtons(line.choices.map((choice) => ({ command: 'dialogue-choice', id: choice.id, label: choice.text }))));
      panel.append(item);
    }
    if (lines.length === 0) panel.append(this.listItem('Local mesh', 'LISTENING', 'Approach a citizen, sovereign agent, ship, or terminal to establish a channel.'));
  }

  private renderConstruction(panel: HTMLElement): void {
    const projects = this.snapshot.construction ?? [];
    for (const raw of projects) {
      const project = typeof raw === 'string'
        ? { id: '', name: raw, status: 'planned', progress: 0, description: 'Requires owned-space permission and local materials.' }
        : raw;
      const item = this.listItem(project.name, (project.status ?? 'planned').toUpperCase(), project.description ?? 'Persistent owned-space modification.');
      const progress = document.createElement('div');
      progress.className = 'hud-progress';
      const meter = document.createElement('i');
      meter.style.width = `${Math.max(0, Math.min(100, project.progress ?? 0))}%`;
      progress.append(meter);
      item.append(progress);
      if (project.id && project.status !== 'completed') {
        item.append(this.commandButtons([{ command: project.status === 'planned' ? 'construction-start' : 'construction-work', id: project.id, label: project.status === 'planned' ? 'Begin project' : 'Apply labor' }]));
      }
      panel.append(item);
    }
    if (projects.length === 0) panel.append(this.listItem('No active blueprint', 'IDLE', 'Construction projects appear when owned-space plans are available.'));
  }

  private commandButtons(commands: Array<{ command: string; id: string; label: string; marketId?: string }>): HTMLElement {
    const group = document.createElement('div');
    group.className = 'hud-actions';
    for (const command of commands) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-action';
      button.dataset.hudCommand = command.command;
      button.dataset.id = command.id;
      if (command.marketId) button.dataset.marketId = command.marketId;
      button.textContent = command.label;
      group.append(button);
    }
    return group;
  }

  private listItem(title: string, meta: string, copy: string): HTMLElement {
    const item = document.createElement('article');
    item.className = 'hud-list-item';
    const row = document.createElement('div');
    row.className = 'hud-list-row';
    const titleElement = document.createElement('span');
    titleElement.className = 'hud-list-title';
    titleElement.textContent = title;
    const metaElement = document.createElement('span');
    metaElement.className = 'hud-list-meta';
    metaElement.textContent = meta;
    const copyElement = document.createElement('div');
    copyElement.className = 'hud-list-copy';
    copyElement.textContent = copy;
    row.append(titleElement, metaElement);
    item.append(row, copyElement);
    return item;
  }

  private setText(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private toggleClass(selector: string, className: string, enabled: boolean): void {
    this.root.querySelector<HTMLElement>(selector)?.classList.toggle(className, enabled);
  }

  private formatCredits(value: number): string {
    return `${Math.round(value).toLocaleString('en-US')} CR`;
  }

  private formatTime(value: string | number | undefined): string {
    if (typeof value === 'string') return value;
    const hours = Math.floor(((value ?? 0) / 60) % 24);
    const minutes = Math.floor((value ?? 0) % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
}

export default UIHUD;

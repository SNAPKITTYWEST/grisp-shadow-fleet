export type ConsoleTone = 'command' | 'error' | 'info' | 'success' | 'warning';

export interface ConsoleCommandContext {
  args: string[];
  raw: string;
  print: (message: unknown, tone?: ConsoleTone) => void;
}

export interface ConsoleCommand {
  name: string;
  description: string;
  usage?: string;
  execute: (context: ConsoleCommandContext) => unknown | Promise<unknown>;
}

export interface DiagnosticsSnapshot {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  objects: number;
  zone: string;
  position: { x: number; y: number; z: number };
  simulationTick?: number;
  worldTime?: number | string;
  saveBytes?: number;
  [key: string]: unknown;
}

/** Keyboard-accessible command surface for deterministic diagnostics and test hooks. */
export class DeveloperConsole {
  private readonly root: HTMLElement;
  private readonly commands = new Map<string, ConsoleCommand>();
  private readonly history: string[] = [];
  private historyIndex = 0;
  private visible = false;
  private diagnosticsProvider: (() => DiagnosticsSnapshot | Record<string, unknown>) | null = null;
  private readonly panel: HTMLElement;
  private readonly output: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly cleanup: Array<() => void> = [];

  public constructor(root: HTMLElement) {
    this.root = root;
    this.installStyles();
    const elements = this.ensureMarkup();
    this.panel = elements.panel;
    this.output = elements.output;
    this.input = elements.input;
    this.installBuiltinCommands();
    this.bindEvents();
  }

  public register(command: ConsoleCommand): void {
    const name = command.name.trim().toLowerCase();
    if (!name) throw new Error('Console command requires a name');
    this.commands.set(name, { ...command, name });
  }

  public unregister(name: string): void {
    this.commands.delete(name.toLowerCase());
  }

  public setDiagnosticsProvider(provider: () => DiagnosticsSnapshot | Record<string, unknown>): void {
    this.diagnosticsProvider = provider;
  }

  public async execute(source: string): Promise<unknown> {
    const trimmed = source.trim();
    if (!trimmed) return undefined;
    this.history.push(trimmed);
    if (this.history.length > 100) this.history.shift();
    this.historyIndex = this.history.length;
    this.log(`> ${trimmed}`, 'command');
    const tokens = this.tokenize(trimmed);
    const name = tokens.shift()?.toLowerCase() ?? '';
    const command = this.commands.get(name);
    if (!command) {
      this.log(`Unknown command "${name}". Type "help" for the command index.`, 'error');
      return undefined;
    }
    try {
      const result = await command.execute({ args: tokens, raw: trimmed, print: (message, tone) => this.log(message, tone) });
      if (result !== undefined) this.log(result, 'success');
      return result;
    } catch (error) {
      this.log(error instanceof Error ? error.message : String(error), 'error');
      return undefined;
    }
  }

  public log(message: unknown, tone: ConsoleTone = 'info'): void {
    const line = document.createElement('div');
    line.className = `console-line is-${tone}`;
    line.textContent = typeof message === 'string' ? message : this.stringify(message);
    this.output.append(line);
    while (this.output.childElementCount > 240) this.output.firstElementChild?.remove();
    this.output.scrollTop = this.output.scrollHeight;
  }

  public clear(): void {
    this.output.replaceChildren();
  }

  public show(): void {
    this.visible = true;
    this.panel.hidden = false;
    this.panel.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => this.input.focus(), 0);
  }

  public hide(): void {
    this.visible = false;
    this.panel.hidden = true;
    this.panel.setAttribute('aria-hidden', 'true');
    this.input.blur();
  }

  public toggle(force?: boolean): void {
    const next = force ?? !this.visible;
    if (next) this.show(); else this.hide();
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public dispose(): void {
    for (const remove of this.cleanup) remove();
    this.cleanup.length = 0;
  }

  private installBuiltinCommands(): void {
    this.register({
      name: 'help',
      description: 'List commands or inspect one command.',
      usage: 'help [command]',
      execute: ({ args }) => {
        const requested = args[0]?.toLowerCase();
        if (requested) {
          const command = this.commands.get(requested);
          if (!command) return `No command named ${requested}`;
          return `${command.usage ?? command.name} — ${command.description}`;
        }
        return [...this.commands.values()]
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((command) => `${(command.usage ?? command.name).padEnd(25)} ${command.description}`)
          .join('\n');
      },
    });
    this.register({ name: 'clear', description: 'Clear console output.', execute: () => this.clear() });
    this.register({
      name: 'diagnostics',
      description: 'Print current renderer and simulation metrics.',
      usage: 'diagnostics',
      execute: () => this.diagnosticsProvider?.() ?? { status: 'provider unavailable' },
    });
    this.register({
      name: 'echo', description: 'Print text.', usage: 'echo <text>', execute: ({ args }) => args.join(' '),
    });
  }

  private bindEvents(): void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === '`' || event.code === 'Backquote') {
        event.preventDefault();
        this.toggle();
        return;
      }
      if (!this.visible) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.hide();
      }
    };
    const onInputKeyDown = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        const source = this.input.value;
        this.input.value = '';
        void this.execute(source);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.historyIndex = Math.max(0, this.historyIndex - 1);
        this.input.value = this.history[this.historyIndex] ?? '';
        this.moveCaretToEnd();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
        this.input.value = this.history[this.historyIndex] ?? '';
        this.moveCaretToEnd();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.hide();
      }
    };
    const close = this.panel.querySelector<HTMLButtonElement>('[data-console-close]');
    const run = this.panel.querySelector<HTMLButtonElement>('[data-console-run]');
    const onClose = (): void => this.hide();
    const onRun = (): void => { const source = this.input.value; this.input.value = ''; void this.execute(source); };
    window.addEventListener('keydown', onKeyDown);
    this.input.addEventListener('keydown', onInputKeyDown);
    close?.addEventListener('click', onClose);
    run?.addEventListener('click', onRun);
    this.cleanup.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => this.input.removeEventListener('keydown', onInputKeyDown),
      () => close?.removeEventListener('click', onClose),
      () => run?.removeEventListener('click', onRun),
    );
  }

  private ensureMarkup(): { panel: HTMLElement; output: HTMLElement; input: HTMLInputElement } {
    let panel = this.root.querySelector<HTMLElement>('#developer-console');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'developer-console';
      this.root.append(panel);
    }
    panel.className = 'developer-console';
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <header class="console-head"><div><strong>DEVELOPER CONSOLE</strong><span>Universe TestHarness / deterministic command bus</span></div><button type="button" data-console-close aria-label="Close console" title="Close"><i data-lucide="x" aria-hidden="true"></i></button></header>
      <div id="console-output" class="console-output" role="log" aria-live="polite"></div>
      <label class="console-command"><span aria-hidden="true">›</span><input id="console-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Developer command" placeholder="help" /><button type="button" data-console-run aria-label="Run command" title="Run command"><i data-lucide="play" aria-hidden="true"></i></button></label>
    `;
    const output = panel.querySelector<HTMLElement>('#console-output');
    const input = panel.querySelector<HTMLInputElement>('#console-input');
    if (!output || !input) throw new Error('Developer console failed to initialize');
    return { panel, output, input };
  }

  private installStyles(): void {
    if (document.getElementById('snapkitty-console-styles')) return;
    const style = document.createElement('style');
    style.id = 'snapkitty-console-styles';
    style.textContent = `
      .developer-console { position: fixed; z-index: 40; left: 50%; top: 9vh; transform: translateX(-50%); width: min(860px, calc(100vw - 28px)); height: min(540px, 72vh); border: 1px solid rgba(111,232,238,.48); border-top: 2px solid #ff3a8c; background: rgba(2,4,8,.98); color: #cad6df; box-shadow: 0 24px 90px rgba(0,0,0,.72); font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: 0; pointer-events: auto; }
      .developer-console[hidden] { display: none; }
      .console-head { height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 12px 0 15px; background: #080b11; border-bottom: 1px solid rgba(255,255,255,.1); }
      .console-head strong { display: block; color: #fff; font: 700 11px/1.2 Inter, sans-serif; }
      .console-head span { color: #6fe8ee; font-size: 9px; }
      .console-head button { width: 30px; height: 30px; border: 1px solid rgba(255,255,255,.18); border-radius: 2px; background: #05070a; color: #dce5ea; font-size: 19px; cursor: pointer; }
      .console-output { height: calc(100% - 88px); padding: 13px 15px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; scrollbar-color: #31414c #070a0f; }
      .console-line { min-height: 18px; color: #a7b3bd; }
      .console-line.is-command { color: #f1bd49; margin-top: 5px; }
      .console-line.is-error { color: #ff63a5; }
      .console-line.is-warning { color: #f1bd49; }
      .console-line.is-success { color: #71f1bd; }
      .console-command { height: 40px; display: grid; grid-template-columns: 22px 1fr 32px; align-items: center; border-top: 1px solid rgba(111,232,238,.26); padding: 0 8px 0 14px; background: #070a0f; color: #6fe8ee; }
      .console-command input { width: 100%; height: 100%; border: 0; outline: 0; background: transparent; color: #fff; font: inherit; caret-color: #ff3a8c; }
      .console-command button { width: 29px; height: 29px; display: grid; place-items: center; border: 1px solid rgba(111,232,238,.35); border-radius: 2px; background: #05080c; color: #6fe8ee; cursor: pointer; }
      .console-command button svg { width: 14px; height: 14px; }
    `;
    document.head.append(style);
  }

  private tokenize(source: string): string[] {
    const tokens: string[] = [];
    const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      tokens.push((match[1] ?? match[2] ?? match[3] ?? '').replace(/\\([\\"'])/g, '$1'));
    }
    return tokens;
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }

  private moveCaretToEnd(): void {
    const end = this.input.value.length;
    this.input.setSelectionRange(end, end);
  }
}

export default DeveloperConsole;

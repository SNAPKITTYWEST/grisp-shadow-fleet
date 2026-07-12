/**
 * Page 04 — Kernel Intercept
 *
 * Pattern-matches the agent's reasoning against the kernel registry.
 * Routes matched reasoning to the correct sovereign kernel before
 * STATE_TRANSITION fires. The agent never computes — it translates.
 *
 * Architecture:
 *   GOVERNANCE_CHECK passes →
 *   KERNEL_INTERCEPT fires (this page) →
 *   kernel executes deterministically →
 *   STATE_TRANSITION receives kernel result →
 *   WORM_SEAL seals everything
 *
 * The routing table is the IP. Not the models.
 */

import type { IAction, IState_v1, IVerdict } from '../../abstract/interfaces/index.js'

// ── Kernel route decision ─────────────────────────────────────────────────────

export interface KernelRoute {
  kernel:   string   // kernel id from kernel-registry.json
  action:   string   // kernel action to invoke
  domain:   string   // detected domain
  matched:  string   // pattern that matched
}

export interface KernelResult {
  routed:   boolean
  route?:   KernelRoute
  output?:  string
  wormRef?: string   // WORM receipt if kernel produced one
}

// ── DFA pattern table (mirrors route-dispatch.rexx) ──────────────────────────
// These run against the agent's REASONING, not the user's input.
// Order matters — first match wins.

const INTERCEPT_PATTERNS: Array<[RegExp, string, string, string]> = [
  // [pattern, kernel, action, domain]
  [/R10|R07|R05|unauthorized.*ach|nacha/i,            'rexx-glue-kernel', 'ACH_DISPUTE',        'ach'],
  [/fcra|credit.*disput|metro.?2|wrong.*dofd/i,        'rexx-glue-kernel', 'FCRA_DISPUTE',       'fcra'],
  [/zombie.*debt|time.barred|statute.*limit/i,          'rexx-glue-kernel', 'ZOMBIE_DEBT_SCAN',   'zombie'],
  [/irrevocable|trust.*deed|grat|bel.*esprit/i,         'rexx-glue-kernel', 'TRUST_SCAN',         'trust'],
  [/irs|catcode|cat-[a-z]{2}|audit.*categor/i,          'rexx-glue-kernel', 'IRS_CATCODE',        'irs'],
  [/prove|theorem|induction|axiom|lemma|formula/i,      'math-dispatcher',  'DISPATCH',           'math'],
  [/topology|reachability|conduction|homotopy/i,        'math-dispatcher',  'DISPATCH',           'math'],
  [/prolog|has_standing|standing.*rule|horn.*clause/i,  'carto-prolog',     'QUERY',              'legal'],
  [/asp.*gate|clingo|unsatisfiable|constitutional/i,    'carto-gate',       'EVALUATE',           'governance'],
  [/worm.*chain|append.*only|seal.*entry|worm.*seal/i,  'worm-chain',       'APPEND',             'worm'],
]

// ── Main intercept function ───────────────────────────────────────────────────

export function interceptReasoning(reasoning: string): KernelResult {
  if (!reasoning?.trim()) return { routed: false }

  for (const [pattern, kernel, action, domain] of INTERCEPT_PATTERNS) {
    const m = pattern.exec(reasoning)
    if (m) {
      return {
        routed: true,
        route: {
          kernel,
          action,
          domain,
          matched: m[0],
        },
      }
    }
  }

  return { routed: false }
}

// ── KernelInterceptImpl — wires into the tick loop ───────────────────────────

export class KernelInterceptImpl {
  readonly interceptPatterns = INTERCEPT_PATTERNS.length

  /**
   * evaluate: called during the KERNEL_INTERCEPT phase.
   * Takes the action's reasoning (if present in payload) and pattern-matches it.
   * Returns a KernelResult — the tick loop uses this to decide whether to
   * skip normal LLM generation and use kernel output instead.
   */
  evaluate(action: IAction, _state: IState_v1): KernelResult {
    // Extract reasoning from action payload
    const reasoning: string =
      (action as any).reasoning ??
      (action as any).payload?.reasoning ??
      (action as any).summary ??
      ''

    return interceptReasoning(reasoning)
  }

  /**
   * buildKernelVerdict: wraps a kernel result as a sovereign verdict.
   * If the kernel routed, the verdict approves with kernel metadata.
   * The agent's job is now just translation, not computation.
   */
  buildKernelVerdict(
    result:  KernelResult,
    action:  IAction,
  ): IVerdict {
    if (!result.routed || !result.route) {
      return {
        kind:     'ALLOW',
        reason:   'no_kernel_intercept: reasoning passed through',
        tick:     action.tick,
        agentId:  action.agentId,
        actionId: action.actionId,
      }
    }

    return {
      kind:     'ALLOW',
      reason:   `kernel_intercept: ${result.route.kernel}.${result.route.action} [${result.route.domain}] matched "${result.route.matched}"`,
      tick:     action.tick,
      agentId:  action.agentId,
      actionId: action.actionId,
    }
  }
}

export const kernelIntercept = new KernelInterceptImpl()

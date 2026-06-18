import { fileURLToPath } from 'node:url';

import { appendEvent, verifyChain, getLastSeal, type WormEvent } from './pages/00-worm/index.js';
import { StateImpl } from './pages/01-state/index.js';
import { GovernanceImpl, CapabilityValidator, crisisLanguageDeny } from './pages/02-governance/index.js';
import { WorkflowImpl, MockLLMNode } from './pages/03-workflow/index.js';
import type { IAction, IState_v1, IVerdict, IWorkflow_v1 } from './abstract/interfaces/index.js';

export interface TickResult {
  readonly action: IAction;
  readonly verdict: IVerdict;
  readonly state: IState_v1;
  readonly wormEvent: WormEvent;
  readonly chainValid: boolean;
  readonly lastSeal: string;
}

export class ShadowOrchestrator {
  private currentState: IState_v1;

  readonly governance: GovernanceImpl;
  readonly workflow: IWorkflow_v1;

  constructor(opts: {
    state?: StateImpl;
    governance?: GovernanceImpl;
    workflow?: IWorkflow_v1;
  } = {}) {
    this.currentState = opts.state ?? StateImpl.genesis();
    this.governance = opts.governance ?? new GovernanceImpl(
      [
        new CapabilityValidator([
          {
            grantId: 'grant-demo-agent',
            agentId: 'demo-agent',
            allowedActionTypes: ['OBSERVE', 'PLAN', 'EXECUTE', 'REFLECT', 'mock_llm_output'],
            deniedActionTypes: ['DESTROY'],
            seal: 'capability-grant-demo-agent',
          },
        ]),
      ],
      [crisisLanguageDeny],
    );
    this.workflow = opts.workflow ?? new WorkflowImpl(new Map([
      ['mock-llm', new MockLLMNode('mock-llm', 'Mock LLM', [], { result: 'model-invariant mock output' })],
    ]));
  }

  get state(): IState_v1 {
    return this.currentState;
  }

  tick(action: IAction): TickResult {
    const verdict = this.governance.evaluate(action, this.currentState);

    if (verdict.kind === 'ALLOW') {
      this.currentState = this.currentState.transition(action);
    }

    const wormEvent = appendEvent(action, this.currentState, verdict.kind);
    const chainCheck = verifyChain();

    return {
      action,
      verdict,
      state: this.currentState,
      wormEvent,
      chainValid: chainCheck.valid,
      lastSeal: getLastSeal(),
    };
  }
}

export function createAction(
  tick: number,
  type: string,
  payload: unknown,
  agentId = 'demo-agent',
): IAction {
  return {
    actionId: `demo-action-${tick}-${type.toLowerCase()}`,
    agentId,
    type,
    payload,
    tick,
  };
}

export async function runDemo(): Promise<TickResult[]> {
  const orchestrator = new ShadowOrchestrator();
  const actions = [
    createAction(1, 'OBSERVE', { input: 'load shadow state' }),
    createAction(2, 'PLAN', { objective: 'compose pages through main.ts' }),
    createAction(3, 'EXECUTE', { step: 'append WORM event' }),
    createAction(4, 'REFLECT', { check: 'verify chain' }),
    createAction(5, 'EXECUTE', { step: 'complete demo run' }),
  ];

  const results = actions.map(action => orchestrator.tick(action));

  for (const result of results) {
    console.log(JSON.stringify({
      tick: result.action.tick,
      actionType: result.action.type,
      verdict: result.verdict.kind,
      stateId: result.state.id,
      wormSeal: result.lastSeal,
      chainValid: result.chainValid,
    }));
  }

  return results;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await runDemo();
}

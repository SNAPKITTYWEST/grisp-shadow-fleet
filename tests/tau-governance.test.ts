import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

interface TauSession {
  consult(
    program: string,
    callbacks: { success: () => void; error: (error: unknown) => void },
  ): void;
  query(
    goal: string,
    callbacks: { success: () => void; error: (error: unknown) => void },
  ): void;
  answer(callback: (answer: false | null | object) => void): void;
}

interface TauProlog {
  create(limit?: number): TauSession;
}

const require = createRequire(import.meta.url);
const prolog = require('tau-prolog') as TauProlog;
const program = readFileSync(join(process.cwd(), 'governance', 'shadow-orchestrator.pl'), 'utf8');

function queryOnce(goal: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const session = prolog.create(1000);
    session.consult(program, {
      success: () => {
        session.query(goal, {
          success: () => {
            session.answer(answer => resolve(answer !== false));
          },
          error: reject,
        });
      },
      error: reject,
    });
  });
}

test('Tau Prolog allows the RANSOM.WORM dispatch route', async () => {
  await expect(queryOnce("dispatch_verdict('ransom_worm:dispatch', 'resurrect', 'ACCEPTED').")).resolves.toBe(true);
});

test('Tau Prolog rejects unknown dispatch message types', async () => {
  await expect(queryOnce("dispatch_verdict('unknown:dispatch', 'resurrect', 'ACCEPTED').")).resolves.toBe(false);
});

test('Tau Prolog guards tick agents and statuses', async () => {
  await expect(queryOnce("agent_allowed('metric-stream', 'tick').")).resolves.toBe(true);
  await expect(queryOnce("status_verdict('metric-stream', 'UPDATED', 'ALLOW').")).resolves.toBe(true);
  await expect(queryOnce("status_verdict('metric-stream', 'ACCEPTED', 'ALLOW').")).resolves.toBe(false);
});

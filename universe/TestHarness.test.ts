import { TestHarness } from './TestHarness.js';

describe('SnapKitty Universe deterministic vertical slice', () => {
  it('passes the complete simulation smoke suite', () => {
    const report = new TestHarness().runSmokeSuite();
    const failures = report.assertions.filter((assertion) => !assertion.passed);
    expect(failures).toEqual([]);
    expect(report.passed).toBe(true);
  });
});

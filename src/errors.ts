import { serializeFixture } from './fixture.js';
import type { FailedResult, HarnessErrorCode, StreamFixture } from './types.js';

/** An invalid or interrupted experiment, rather than a consumer counterexample. */
export class StreamHarnessError extends Error {
  override readonly name = 'StreamHarnessError';
  constructor(
    readonly code: HarnessErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** A verified consumer counterexample, with portable replay data attached. */
export class StreamCheckError extends Error {
  override readonly name = 'StreamCheckError';
  readonly fixture: StreamFixture;
  constructor(readonly result: FailedResult) {
    super(
      `Sutuy found a ${result.phase} failure (seed ${result.seed}, ${result.cases} discovery cases).\n` +
        `${result.failure.name}: ${result.failure.message}\n` +
        `Cuts: ${result.originalFixture.cuts.length} → ${result.fixture.cuts.length}; ` +
        `reduction ${result.shrink.complete ? 'complete' : 'budget exhausted'}.\n` +
        `Replay with replay(parseFixture(json)):\n${serializeFixture(result.fixture)}`,
    );
    this.fixture = result.fixture;
  }
}

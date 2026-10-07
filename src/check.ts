import { integerOption, streamCases } from './cases.js';
import { StreamCheckError, StreamHarnessError } from './errors.js';
import { openReplay, withCuts } from './fixture.js';
import type {
  CheckOptions,
  CheckResult,
  FailureSummary,
  StreamFixture,
  TestContext,
} from './types.js';

function summarize(error: unknown, failureKey: CheckOptions['failureKey']): FailureSummary {
  try {
    const isError = error instanceof Error;
    const name = isError ? error.name : 'ThrownValue';
    const message = isError ? error.message : String(error);
    if (
      !failureKey &&
      !isError &&
      ((typeof error === 'object' && error !== null) ||
        typeof error === 'function' ||
        typeof error === 'symbol')
    ) {
      throw new TypeError('throw an Error or supply failureKey for nonprimitive thrown values');
    }
    const key = failureKey
      ? failureKey(error)
      : JSON.stringify([isError ? 'Error' : typeof error, name, message]);
    if (typeof key !== 'string' || key.length === 0)
      throw new TypeError('failureKey must return a nonempty string');
    return Object.freeze({ name, message, key });
  } catch (cause) {
    throw new StreamHarnessError('INVALID_FAILURE_KEY', 'Cannot identify the consumer failure', {
      cause,
    });
  }
}

async function evaluate(
  fixture: StreamFixture,
  options: CheckOptions,
  phase: TestContext['phase'],
  caseIndex: number,
  timeoutMs: number,
): Promise<FailureSummary | null> {
  if (options.signal?.aborted)
    throw new StreamHarnessError('ABORTED', 'Stream check aborted', {
      cause: options.signal.reason,
    });
  const controller = new AbortController();
  const source = openReplay(fixture);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    const stop = (error: StreamHarnessError) => {
      // Reject first: a consumer reacting to cancellation must not win this race.
      reject(error);
      controller.abort(error);
      source.dispose(error);
    };
    onAbort = () =>
      stop(
        new StreamHarnessError('ABORTED', 'Stream check aborted', {
          cause: options.signal?.reason,
        }),
      );
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(
      () =>
        stop(
          new StreamHarnessError('TIMEOUT', `Consumer exceeded ${timeoutMs} ms during ${phase}`),
        ),
      timeoutMs,
    );
  });
  try {
    const context: TestContext = Object.freeze({
      signal: controller.signal,
      fixture,
      caseIndex,
      phase,
    });
    const outcome = await Promise.race([
      interrupted,
      Promise.resolve()
        .then(() => options.test(source.stream, context))
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
    ]);
    return outcome.ok ? null : summarize(outcome.error, options.failureKey);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    const reason = new DOMException('Sutuy evaluation finished', 'AbortError');
    source.dispose(reason);
    controller.abort(reason);
  }
}

async function reduceCuts(
  original: StreamFixture,
  key: string,
  budget: number,
  run: (fixture: StreamFixture) => Promise<FailureSummary | null>,
): Promise<{ fixture: StreamFixture; attempts: number; complete: boolean }> {
  let fixture = original;
  let attempts = 0;
  let granularity = 2;
  while (fixture.cuts.length > 0) {
    const size = Math.ceil(fixture.cuts.length / granularity);
    let reduced = false;
    for (let start = 0; start < fixture.cuts.length; start += size) {
      if (attempts >= budget) return { fixture, attempts, complete: false };
      const cuts = [...fixture.cuts.slice(0, start), ...fixture.cuts.slice(start + size)];
      const candidate = withCuts(fixture.data, cuts);
      attempts++;
      if ((await run(candidate))?.key === key) {
        fixture = candidate;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (reduced) continue;
    if (granularity >= fixture.cuts.length) return { fixture, attempts, complete: true };
    granularity = Math.min(fixture.cuts.length, granularity * 2);
  }
  return { fixture, attempts, complete: true };
}

export async function checkStream(options: CheckOptions): Promise<CheckResult> {
  if (typeof options.test !== 'function') throw new TypeError('test must be a function');
  if (options.failureKey !== undefined && typeof options.failureKey !== 'function')
    throw new TypeError('failureKey must be a function');
  const seed = integerOption('seed', options.seed ?? 42, 0, 0xffff_ffff);
  const maxShrinks = integerOption('maxShrinks', options.maxShrinks ?? 200, 0, 10_000);
  const timeoutMs = integerOption('timeoutMs', options.timeoutMs ?? 2_000, 1, 2_147_483_647);
  const fixtures = streamCases(options.input, options);
  const observations = new Map<string, string | null>();
  let cases = 0;
  let evaluations = 0;
  const run = async (fixture: StreamFixture, phase: TestContext['phase']) => {
    evaluations++;
    const failure = await evaluate(fixture, options, phase, cases - 1, timeoutMs);
    const cuts = fixture.cuts.join(',');
    const key = failure?.key ?? null;
    if (observations.has(cuts) && observations.get(cuts) !== key) {
      throw new StreamHarnessError(
        'UNSTABLE_FAILURE',
        `The same fixture produced different outcomes during ${phase}; isolate callback state and use a stable failureKey`,
      );
    }
    observations.set(cuts, key);
    return failure;
  };
  for (const originalFixture of fixtures) {
    cases++;
    const failure = await run(originalFixture, 'discovery');
    if (!failure) continue;
    await run(originalFixture, 'reproduce');
    const phase = cases === 1 ? 'baseline' : 'partition';
    const reduced =
      phase === 'baseline'
        ? { fixture: originalFixture, attempts: 0, complete: true }
        : await reduceCuts(originalFixture, failure.key, maxShrinks, (fixture) =>
            run(fixture, 'shrink'),
          );
    if (phase === 'partition') await run(reduced.fixture, 'verify');
    return Object.freeze({
      status: 'failed',
      seed,
      cases,
      evaluations,
      phase,
      failure,
      originalFixture,
      fixture: reduced.fixture,
      shrink: Object.freeze({
        attempts: reduced.attempts,
        budget: maxShrinks,
        complete: reduced.complete,
      }),
    });
  }
  return Object.freeze({ status: 'passed', seed, cases, evaluations });
}

export async function assertStream(options: CheckOptions): Promise<void> {
  const result = await checkStream(options);
  if (result.status === 'failed') throw new StreamCheckError(result);
}

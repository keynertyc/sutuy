/** Strings are UTF-8 encoded; Uint8Array inputs are copied byte for byte. */
export type StreamInput = string | Uint8Array;

/** Portable, immutable byte payload plus exclusive chunk-end offsets. */
export interface StreamFixture {
  readonly version: 1;
  readonly encoding: 'hex';
  readonly data: string;
  readonly cuts: readonly number[];
}

export interface CaseOptions {
  /** Unsigned 32-bit seed, including zero. Default: 42. */
  readonly seed?: number;
  /** Total discovery budget, including the baseline. 1–10,000. Default: 100. */
  readonly runs?: number;
}

export interface TestContext {
  readonly signal: AbortSignal;
  readonly fixture: StreamFixture;
  /** Zero-based discovery index; retained during reduction of that case. */
  readonly caseIndex: number;
  readonly phase: 'discovery' | 'reproduce' | 'shrink' | 'verify';
}

export interface CheckOptions extends CaseOptions {
  readonly input: StreamInput;
  readonly test: (stream: ReadableStream<Uint8Array>, context: TestContext) => void | Promise<void>;
  /** Candidate evaluations during reduction. 0–10,000. Default: 200. */
  readonly maxShrinks?: number;
  /** Deadline per callback in milliseconds. 1–2,147,483,647. Default: 2,000. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Stable identity of a thrown failure. Must return a nonempty string. */
  readonly failureKey?: (error: unknown) => string;
}

export interface FailureSummary {
  readonly name: string;
  readonly message: string;
  readonly key: string;
}

export interface PassedResult {
  readonly status: 'passed';
  readonly seed: number;
  /** Actual number of discovery cases executed. */
  readonly cases: number;
  /** All callback invocations, including reproduction, reduction, and verification. */
  readonly evaluations: number;
}

export interface FailedResult {
  readonly status: 'failed';
  readonly seed: number;
  readonly cases: number;
  readonly evaluations: number;
  readonly phase: 'baseline' | 'partition';
  readonly failure: FailureSummary;
  readonly originalFixture: StreamFixture;
  readonly fixture: StreamFixture;
  readonly shrink: {
    readonly attempts: number;
    readonly budget: number;
    /** Every single-cut deletion was tried on the final fixture, or no cuts remain. */
    readonly complete: boolean;
  };
}

export type CheckResult = PassedResult | FailedResult;
export type HarnessErrorCode = 'TIMEOUT' | 'ABORTED' | 'UNSTABLE_FAILURE' | 'INVALID_FAILURE_KEY';

export interface SseEvent {
  readonly data: string;
  readonly id?: string;
  readonly event?: string;
  readonly retry?: number;
}

export interface SseOptions {
  readonly lineEnding?: '\n' | '\r\n';
}

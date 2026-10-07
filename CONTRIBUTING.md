# Contributing

Use Node 22.12 or later and pnpm 12.9.1. Run `pnpm install --frozen-lockfile`, then
`pnpm check`. Keep the package independent of any sibling checkout.

If dependencies are already installed but pnpm's pinned-version bootstrap cannot
reach the registry, `pnpm with current check` uses the installed pnpm executable.
Use the pinned version above for reproducible checks. The built demo can also run
directly with `node examples/demo.mjs`.

Use `pnpm test:watch` during development and `pnpm format` before the final check.
Tests should exercise public behavior and realistic consumers. Add a failing
regression test before changing byte preservation, reproducibility, or reduction.
Runtime dependencies and framework adapters need a concrete use case; keep the core small.

The core lives in `src/`: fixture encoding/replay, deterministic generation,
assertion execution/reduction, errors, types, and two small payload builders.
All public exports pass through `src/index.ts`.

`pnpm check` runs lint, strict types, coverage, bundle/declarations with publint and
Are the Types Wrong, executable Markdown examples, the offline demo, and isolated
npm-tarball consumers. Coverage thresholds are 90% statements/functions/lines and
85% branches. Do not replace meaningful assertions with coverage-only tests.

Keep API and semantics docs aligned with code. Mark complete runnable JavaScript
documentation blocks with `<!-- sutuy:run -->`; `check:docs` executes each block in
its own module. Integration recipes with application placeholders are illustrative.
Relative Markdown links are checked automatically.

The [CI workflow](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml) checks
Node 22, 24, and 26 on pushes to `main` and pull requests. It does not publish.
Follow [release setup](./docs/releasing.md) for the first release.

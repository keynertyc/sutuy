# Releasing Sutuy

Repository: [keynertyc/sutuy](https://github.com/keynertyc/sutuy). This guide covers
the first release and later updates. The existing CI workflow validates changes;
it does not publish.

## First release

1. Use an npm account with a verified email and publishing 2FA enabled. Authenticate
   on your own machine with `npm login`, then confirm the account with `npm whoami`.
   Keep passwords, tokens, and 2FA responses out of issues, chat, and source files.
2. Check the registry using `npm view sutuy name version`. An E404 indicates there
   is no package visible under that exact name; it does not reserve the name or
   guarantee that npm naming rules will allow it. Network/authentication failures
   are not evidence of availability. If the name is taken, agree on an alternative
   before changing metadata or examples.
3. Verify the version in `package.json` (`0.1.0` for the first release), finalize the
   changelog, and update the development-status notices in both READMEs as part of
   the authorized release. Commit those changes and wait for all
   [CI jobs](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml) to pass.
4. From a clean checkout, run `pnpm install --frozen-lockfile`, `pnpm check`, and
   `npm pack --dry-run`. Inspect the artifact file list and version. The allowlist
   includes runtime output, documentation, and examples; there are no runtime
   dependencies or install hooks.
5. Once the maintainer authorizes publication, run `npm publish --access public`
   from the package root and complete the 2FA prompt. This is the public release
   step; the commands before it do not publish. Local publishing does not produce
   GitHub Actions provenance.
6. Verify `npm view sutuy@0.1.0 version`, install `sutuy@0.1.0` in a clean consumer,
   and confirm the [npm package page](https://www.npmjs.com/package/sutuy). Create
   the matching `v0.1.0` Git tag and GitHub release for the published commit.

Direct interactive publishing requires account 2FA. See npm's
[unscoped package publishing guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).

## Subsequent releases through GitHub Actions

Prefer npm trusted publishing (OIDC) so CI does not need a stored npm write token.
After the package exists, add a manually triggered `.github/workflows/publish.yml`
that checks the intended version/commit, installs locked dependencies, runs all
checks, builds, and publishes from a GitHub-hosted runner. Give it `contents: read`
and `id-token: write`; use Node 24 and npm 11.5.1 or later. This publishing workflow
is not installed by the initial repository setup.

In npm's package settings, configure a GitHub Actions trusted publisher with:

| Field | Value |
| --- | --- |
| Organization or user | `keynertyc` |
| Repository | `sutuy` |
| Workflow filename | `publish.yml` (must already exist in the repository) |
| Environment | Leave empty unless the workflow declares an environment |
| Allowed actions | Enable direct `npm publish` if using that command |

Current npm configurations allow staged publishing by default; direct publication
must be enabled explicitly. A new trusted publisher must complete its first
successful publication within two days or be recreated. GitHub Actions OIDC
publishing from this public repository produces provenance automatically.

Set up the workflow and trusted publisher together when a release is ready. Keep
the package's `repository.url` aligned with this repository and use a new npm
version for each release. See the current
[npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
before configuring it.

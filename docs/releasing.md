# Releasing Sutuy

Repository: [keynertyc/sutuy](https://github.com/keynertyc/sutuy). Releases currently
use the manual process below. The existing CI workflow validates changes; it does
not publish.

## Manual releases

1. Choose an unused version according to the
   [compatibility policy](./semantics.md#versioning-and-compatibility). Update
   `package.json` and the changelog. Preserve previously published versions and tags.
2. Use an npm account with publishing access, a verified email, and publishing 2FA
   enabled. Confirm the account with `npm whoami`; use `npm login` if needed.
   Keep passwords, tokens, and 2FA responses out of issues, chat, and source files.
3. From the package root, check whether the target version already exists:

   ```sh
   SUTUY_VERSION=$(node -p "require('./package.json').version")
   npm view "sutuy@$SUTUY_VERSION" version --registry=https://registry.npmjs.org
   ```

   An E404 indicates that the version is not visible in the registry. Network or
   authentication failures do not establish availability. If it already exists,
   verify whether the release completed earlier before choosing another version.
4. Run `pnpm install --frozen-lockfile` and `pnpm check`. Dependency script approvals
   live in `pnpm-workspace.yaml`; review a changed dependency before granting a new
   approval. Commit and push the release changes, then wait for every
   [CI job](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml) on that commit
   to pass.
5. From the unchanged release checkout, run `npm pack --ignore-scripts`. The build
   already passed in the previous step. Inspect the archive's file list and version:
   it includes runtime output, documentation, and examples, with no runtime
   dependencies or install hooks.
6. Once publication is authorized, publish the reviewed archive from the same
   terminal and complete npm's account verification:

   ```sh
   npm publish "./sutuy-${SUTUY_VERSION}.tgz" --access public --registry=https://registry.npmjs.org
   ```

   Local publishing does not produce GitHub Actions provenance. npm may need a few
   minutes to process the release before it becomes available.
7. Verify the version and archive integrity with
   `npm view "sutuy@$SUTUY_VERSION" version dist.integrity --json`, install that exact
   version in a clean consumer, and check the
   [npm package page](https://www.npmjs.com/package/sutuy). Tag the published commit
   and create its GitHub release:

   ```sh
   git tag -a "v${SUTUY_VERSION}" -m "Sutuy ${SUTUY_VERSION}"
   git push origin "v${SUTUY_VERSION}"
   ```

Direct interactive publishing requires account 2FA. See npm's
[unscoped package publishing guide](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).

## Future releases through GitHub Actions

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

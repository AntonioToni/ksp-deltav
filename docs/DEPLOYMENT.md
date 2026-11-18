# Production and pull request previews

The repository publishes one GitHub Pages site:

| Build | URL |
| --- | --- |
| Production | <https://antoniotoni.github.io/ksp-deltav/> |
| Trusted PR preview | `https://antoniotoni.github.io/ksp-deltav/previews/pr-{number}/` |

GitHub Pages hosts a single site per repository. Preview deployments therefore
publish a complete snapshot containing the production root and every active
preview. A PR build is never deployed as the site's production root. No external
hosting service, personal access token, or additional deployment secret is used.

## Build and publish flow

The workflows are `.github/workflows/deploy-pages.yml` (production validation),
`build-pr-preview.yml` (preview validation), and `publish-pages.yml` (the sole
Pages publisher). Trusted scripts live under `.github/scripts/`.

1. A push to `main` runs the production workflow. It installs locked dependencies,
   runs lint and unit tests, builds the production app, and runs the existing
   desktop Playwright suite at the Pages project path. A successful run uploads
   a versioned build artifact.
2. Opening, reopening, or updating a PR targeting `main` starts a preview build
   only when its head branch belongs to this repository. The build checks out
   GitHub's PR merge commit, which includes the base branch's deployment
   infrastructure even when the feature branch predates it. It runs with a
   read-only workflow token, without deployment credentials.
3. A separate publisher runs trusted `main` code after build completion and on
   PR lifecycle changes. It does not install PR dependencies, check out PR code,
   or execute files from a PR artifact.
4. The publisher reads the current `main` commit and current open PR heads from
   GitHub. It validates build provenance, restores the durable site snapshot,
   applies current successful builds, and removes previews whose PRs are closed
   or no longer eligible.
5. The combined site is uploaded as one normal Pages artifact and deployed using
   the existing protected `github-pages` environment. A single bot-owned PR
   comment reports the preview URL and status. It is updated rather than posted
   repeatedly, and a successful publication is reported only after Pages succeeds.

The `pages-state` branch holds the durable static snapshot and an internal
deployment manifest. It is storage for the publisher, not the Pages build source.
Production remains at the root; previews occupy only their own `previews/pr-N/`
directories. Existing snapshots survive build artifact expiry, failed updates,
and subsequent production deployments.

The first publication requires a validated production build. Until that exists,
the publisher waits rather than creating a preview-only site or replacing the
production root with an empty directory.

## Concurrency and stale runs

All publishing uses one repository-wide concurrency group. Builds can run
independently, but site reconciliation and publication are serialized.

GitHub Actions can replace an older pending concurrency run with a newer one.
Consequently, every publisher run reconciles **all** current previews and
production, not just the PR that triggered it. This prevents a superseded
notification from losing another PR's update or cleanup.

The publisher checks authoritative repository, workflow, event, run, attempt,
branch, and source-commit identities. A delayed build of an old PR head cannot
replace a newer preview, and a production build of an old `main` commit cannot
roll back production. Failed preview builds retain existing site files; the PR
comment distinguishes a failed latest build from an older retained preview.
Publication can be retried after a Pages failure even if snapshot contents have
not changed.

## Preview application behavior

Production keeps its current header, paths, preferences, and canonical URL.
Preview builds add a small **Preview · PR #N** header badge.

Build context is explicit:

| Environment variable | Production default | Preview example |
| --- | --- | --- |
| `VITE_BASE_PATH` | `/ksp-deltav/` | `/ksp-deltav/previews/pr-24/` |
| `VITE_PREVIEW_PR_NUMBER` | Unset | `24` |

Normal local development continues to use `/`. Preview numbers must be positive
integers and match the nested base path. A preview path without a preview number
is rejected, so the badge and preview protections cannot be omitted by accident.
These variables are public build configuration, not places to store secrets.

JavaScript, CSS, fonts, icons, and the social preview image are served from the
selected build base. The canonical link continues to identify production.
Preview HTML has `noindex, nofollow, noarchive` metadata and omits production's
structured search listing. Preview `robots.txt` disallows crawling; production's
project-level file disallows the preview prefix. Crawlers normally read
`/robots.txt` at the origin root, so project-level robots files alone cannot
prevent indexing. The preview's HTML `noindex` directive is the relevant
per-page protection; previews must not be treated as private content.

The shared `analyticsEnabled` build gate is false for previews. Future analytics
integrations must check it before initialization. Preview HTML additionally
uses a Content Security Policy that blocks fetch, XHR, and beacon connections,
plus external scripts and images. Frames, workers, and form submissions are
disabled; local assets and Material UI styles remain available. There is no
analytics service in the current application.

App-owned browser storage keys are prefixed per PR, for example
`ksp-deltav:preview:pr-24:ksp-deltav:relay-planner-mode`. Production keys are
unchanged. The same PR keeps its preferences when updated; other previews and
production use separate keys. Closing a PR removes its published directory,
not storage already saved in a visitor's browser.

## Security boundary

Production and previews share the `antoniotoni.github.io` browser origin.
**Only trusted branches in this repository may be published. Fork PRs do not
receive previews under this origin.** A contributor's fork is not made trusted
by a label or an approval comment.

Storage namespacing and the preview CSP reduce accidental cross-contamination
and analytics requests; they are not a security sandbox. Trusted preview
JavaScript still runs on the production origin. Review same-repository code and
dependency changes accordingly. Do not put secrets in static files or previews.

The publisher checks artifacts as data. It rejects unsafe archive paths, links,
special files, reserved deployment paths, invalid metadata, and oversized
payloads. Only validated artifact contents are copied into the consolidated
site. Build jobs do not receive Pages write or OIDC permissions. Privileged
publishing uses GitHub's temporary workflow token and trusted workflow scripts.

## Repository settings

The current repository already uses **Settings → Pages → Build and deployment →
GitHub Actions**. Keep that source; do not change Pages to publish `pages-state`
as a branch source.

Keep the existing `github-pages` environment's required reviewers and deployment
branch restrictions. Publishing runs from `main`; enabling previews does not
require allowing feature branches to deploy directly or weakening `main` branch
protection.

Repository or organization policies must permit the workflow's declared token
permissions: read build artifacts, write the dedicated state branch and PR
status comments, and deploy Pages with OIDC. If a ruleset restricts
`pages-state`, allow the publisher's workflow token to update that branch
without granting a bypass on `main`. A policy-denied publication should be
resolved through repository settings, not a personal access token.

## Local checks

Run the normal checks without preview environment variables:

```sh
npm ci
npm test
npm run test:deployment
npm run lint
npm run test:pages -- --project=desktop
```

To test a nested preview build locally, pass the same context to both the build
and browser command:

```sh
VITE_BASE_PATH=/ksp-deltav/previews/pr-24/ VITE_PREVIEW_PR_NUMBER=24 npm run build
VITE_BASE_PATH=/ksp-deltav/previews/pr-24/ VITE_PREVIEW_PR_NUMBER=24 npx playwright test --config=playwright.preview.config.ts
```

The deployment browser checks use production output rather than Vite's
development fallback. They cover desktop and mobile paths, assets, the badge,
mission and relay controls, indexing metadata, CSP restrictions, and storage
isolation. Keep preview variables scoped to the commands that need them; normal
unit fixtures deliberately check unchanged production storage keys.
Deployment-script checks require Python 3 as well as Node.js 24. They exercise
real bounded ZIP extraction, API provenance with a mocked GitHub service, and
temporary consolidated snapshots without pushing branches or publishing Pages.

## First automated preview after merge

The publishing workflow must be on `main` before GitHub can run it safely.
Validation on the infrastructure PR cannot itself exercise a not-yet-installed
privileged publisher.

1. Merge the infrastructure PR through normal review. Wait for its `main`
   production build and consolidated Pages publication to succeed. Check the
   production URL, its asset requests, and the unchanged header.
   Let any pre-migration production deployment finish first. Do not manually
   rerun legacy production runs from before this change: their historical
   workflow deployed a production-only artifact. Use the current publisher's
   **Run workflow** action on `main` to retry reconciliation instead.
2. Create a fresh branch from updated `main` with a harmless, reviewable change
   and open a PR targeting `main`. Wait for the read-only preview build and the
   protected Pages publisher. If the environment requires approval, approve the
   publisher through the existing process.
3. Follow the single bot comment. Confirm the URL ends in `/previews/pr-N/`, the
   badge shows that PR number, assets load beneath the nested path, and a simple
   mission and the relay dialog work on desktop and mobile. Inspect the initial
   HTML for `noindex` and verify production remains unchanged.
4. Open a second trusted test PR. Verify both previews coexist. Push another
   commit to the first PR and check that its URL and comment update while the
   second preview and production remain intact.
5. On a disposable test branch, introduce a deliberate build failure. Confirm
   the comment reports failure, the previous preview is clearly identified if
   retained, and production and the other preview still work. Restore the build.
6. Close or merge the test PRs through the normal review process. After cleanup
   publication, verify their preview directories are gone and production remains
   available. Reopening a trusted PR should build and publish its preview again.

Existing feature branches do not need infrastructure changes pushed into them
by the publisher. Their next preview build uses GitHub's merge ref. A PR with
merge conflicts cannot produce a valid merge build; resolve the conflict before
expecting an updated preview. Existing PRs may need a new commit, reopening, or a
normal workflow rerun to trigger their first preview after infrastructure lands.
Base-only changes to `main` preserve existing previews rather than rebuilding
every PR automatically. A new PR commit, reopening, or a build rerun refreshes
the merge snapshot when updated base code needs to be tested.

## Limits and maintenance

- GitHub Pages supports a maximum published site size of 1 GB. All previews
  count toward this one site. Each input artifact is limited to **150 MiB and
  10,000 files**; the combined static snapshot is limited to **750 MiB and
  50,000 files**, below the Pages size limit. Large or numerous previews may
  need to be closed before another publication can fit.
- Git history on `pages-state` contains compiled snapshots and can grow over
  time. Preview cleanup removes current published directories; it does not erase
  old Git objects, browser caches, or previously downloaded files. Plan any
  history maintenance separately from normal production deployment.
- A failed or cancelled build does not publish a new preview. An expired artifact
  does not remove an active preview already stored in the durable snapshot.
- Environment approvals, GitHub Actions availability, and Pages propagation can
  delay publication and cleanup. A manual publisher reconciliation from `main`
  can retry after the underlying problem is fixed.
- GitHub Pages cannot set arbitrary HTTP response headers. Preview CSP and
  indexing protections are delivered in HTML; they do not create an isolated
  origin or authenticated staging environment.

The change is tracked by [issue #13](https://github.com/AntonioToni/ksp-deltav/issues/13)
in the v1.2.0 milestone.

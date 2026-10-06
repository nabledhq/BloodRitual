# 0010. Retire the browser prototype

Status: Accepted

## Context

ADR 0001 kept the Babylon.js browser prototype (`src/`, `index.html`,
`package.json`, deployed to GitHub Pages by `.github/workflows/nabled-play.yml`)
as a preview alongside the Unreal Engine project, and ARCHITECTURE.md left its
future as a later decision. Development has moved to the Unreal project, and
maintaining a second, unrelated codebase with its own toolchain (Node.js, Vite,
Vitest) costs effort without moving the shipping game forward.

## Decision

Remove the browser prototype from the repository: its source, tests, page
shells, npm manifest and lockfile, Vite config, its screenshots under
`docs/screenshots/`, and the GitHub Pages workflow that built it. The Unreal
Engine 5.8 project is the only game in the repository.

## Consequences

* The repository needs no Node.js toolchain; `node_modules/` and `dist/` are
  no longer ignored by Git.
* There is no browser build for backers to try. Previews come from packaged
  Windows builds of the Unreal project.
* The nabled browser-play deployment no longer has anything to build; it
  should be turned off in nabled so the workflow is not regenerated.
* The prototype stays available in Git history (last present in commit
  `98ec785`) if any of its procedural art or character work is wanted as
  reference.
* ADR 0001's note that "the browser prototype remains a preview" is
  superseded by this record.

# 0008. Git LFS before Perforce

Status: Accepted

## Context

Unreal projects hold many large binary assets (`.uasset`, `.umap`, textures,
meshes, audio) that Git handles poorly without help. Perforce is the
industry default for Unreal teams, with file locking and good editor
integration, but it needs a server and is a poor fit for a community-funded
open project whose contributions arrive as GitHub pull requests.

## Decision

* Keep **Git**, hosted on GitHub, and route binary assets through **Git
  LFS**. `.gitattributes` tracks `*.uasset`, `*.umap`, `*.fbx`, `*.wav`,
  `*.png`, `*.tga`, `*.psd`, `*.blend`, `*.spp`, `*.sbs` and `*.sbsar`.
* Contributors run `git lfs install` once before cloning or pulling.
* Avoid binary merge conflicts by process: one open ticket owns a given map
  or asset at a time; keep maps small; use World Partition data layers and
  One File Per Actor.
* `.gitignore` excludes generated directories (`Binaries/`,
  `Intermediate/`, `Saved/`, `DerivedDataCache/`) and IDE files; `Content/`
  and `Config/` are tracked.

## Consequences

* The existing pull-request workflow and GitHub Pages preview keep working.
* LFS bandwidth and storage quotas apply; large asset drops should be
  reviewed for size (see `ASSETS_LICENSES.md` for the current limits).
* LFS has no locking by default; coordination is social, not enforced. If
  this becomes a bottleneck, moving to Perforce (or enabling LFS file
  locking) is a later ticket. Nothing in the layout prevents it.
* Files already committed before this rule (for example the screenshots in
  `docs/screenshots/`) remain ordinary Git objects; only new matching files
  go through LFS unless a migration is done deliberately.

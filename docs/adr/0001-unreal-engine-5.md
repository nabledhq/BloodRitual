# 0001. Unreal Engine 5

Status: Accepted

## Context

The game needs a 3D engine for a desktop co-op survival game with a large
streamed outdoor world, a population of AI characters, networking and a Steam
release. The repository already holds a Babylon.js browser prototype that is
useful for previews but is not a production game engine for this scope.

## Decision

Build the game on Unreal Engine **5.8**. Desktop first, distributed on Steam.
The project is a C++ project (`BloodRitual.uproject`, module `BloodRitual`), not a
Blueprint-only project.

## Consequences

* World Partition, PCG, StateTree, AI Perception, NavMesh, the replication
  system, Enhanced Input, UMG/CommonUI and MetaSounds come with the engine;
  the other ADRs build on them.
* Binary assets (`.uasset`, `.umap`) require Git LFS and careful
  coordination (see ADR 0008).
* Contributors need an Unreal 5.8 installation and a C++ toolchain. Engine
  version is pinned by `EngineAssociation`; upgrades are explicit tickets.
* The browser prototype remains a preview, not a second target.

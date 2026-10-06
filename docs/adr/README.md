# Architecture decision records

Each record captures one decision behind [ARCHITECTURE.md](../ARCHITECTURE.md)
with **Context**, **Decision** and **Consequences** headings. Records are
numbered in order and never edited to change their meaning; a reversed
decision gets a new record that supersedes the old one.

| # | Decision |
| --- | --- |
| [0001](0001-unreal-engine-5.md) | Unreal Engine 5 (5.8, desktop first, Steam) |
| [0002](0002-cpp-blueprint-hybrid.md) | C++ for core systems, Blueprint and data assets for content |
| [0003](0003-statetree-ai-without-massentity-at-first.md) | StateTree AI without MassEntity at first |
| [0004](0004-noise-event-system.md) | Noise as one shared gameplay event |
| [0005](0005-listen-server-and-steam.md) | Listen server for 1–4 player co-op, Steam for sessions |
| [0006](0006-host-owned-save-game.md) | Host-owned save game |
| [0007](0007-no-gameplay-ability-system-by-default.md) | No Gameplay Ability System by default |
| [0008](0008-git-lfs-before-perforce.md) | Git with Git LFS before Perforce |
| [0009](0009-vertical-slice-placeholder-systems.md) | Vertical slice placeholder systems: one settings class, authoritative state on framework objects, deterministic time, C++ interfaces, runtime-spawned primitives |

To add a record, copy the structure of an existing file, use the next number
and add a row here.

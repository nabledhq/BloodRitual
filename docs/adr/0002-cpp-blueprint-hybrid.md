# 0002. C++ and Blueprint hybrid

Status: Accepted

## Context

Unreal supports pure Blueprint, pure C++ and mixed projects. Seminole's
systems (AI, noise, replication, persistence) need performance, diffable
source and unit-testable logic. Its content (characters, items, weapons,
missions, tuning) benefits from fast iteration by non-programmers.

## Decision

* **C++ for core systems**: base actor and component classes, subsystems,
  replication, save/load, StateTree tasks and anything performance-sensitive.
  Code lives in `Source/Seminole/<System>/`.
* **Blueprint and data assets for content**: concrete characters, items,
  weapons, missions, StateTree assets and tuning values. Blueprint classes
  derive from C++ bases and contain presentation and configuration, not
  system logic.
* Exposed C++ API is marked `BlueprintCallable` / `BlueprintReadOnly` where
  content needs it; everything else stays private.

## Consequences

* Core logic is reviewable in pull requests and merges cleanly; Blueprint
  assets are binary and conflict-prone, so they stay thin.
* Every system ticket delivers a C++ base plus one or more Blueprint or data
  asset examples under `Content/`.
* Contributors who only touch content do not need to compile C++ once a
  build is available, but the repository remains a C++ project.

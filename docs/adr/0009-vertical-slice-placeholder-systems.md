# 0009. Vertical slice placeholder systems

Status: Accepted

## Context

The playable vertical slice is funded in three parts (#23 part 1: config,
clock, noise, loot and stockpile; part 2: canoe, weapons, infected; part 3:
night defense, barricades, game flow). It must be built without a compiler
or CI in the implementer's environment, without new binary assets, and so
that parts 2 and 3 can extend it rather than replace it. Several choices
recur across the parts and are recorded here once.

## Decision

* **One `UDeveloperSettings` for tunables.** `UBloodRitualSettings`
  (`Config=Game, DefaultConfig`) holds every gameplay number of the slice
  with its default in C++. Code reads `GetDefault<UBloodRitualSettings>()`
  and never hard-codes a tunable; designers edit Project Settings > Game >
  Blood Ritual and the values land in `Config/DefaultGame.ini`. Data assets per
  item (ADR 0002) arrive when there is real content to describe.
* **Authoritative state on framework objects.** The day clock is a component
  on `ABloodRitualGameState`; stockpile totals live on the authority-spawned
  `ABloodRitualStockpile`. Nothing is replicated yet (solo only), but the state
  already sits where `Replicated` can be added without moving it (ADR 0005).
* **Deterministic time.** Anything timed exposes an `Advance(DeltaSeconds)`
  style entry point (`UBloodRitualDayClockComponent::Advance`,
  `ABloodRitualSupplyContainer::AdvanceSearch`) that `Tick` feeds in play and
  automation tests call directly. No system reads wall-clock time.
* **C++ interfaces for cross-system contracts.** `IBloodRitualNoiseListener`
  and `IBloodRitualInteractable` are `CannotImplementInterfaceInBlueprint`
  interfaces; Blueprint subclasses of a C++ implementer inherit the
  implementation. This keeps dispatch plain C++ and testable.
* **Placeholder content is runtime-spawned C++ primitives.** The test
  environment from #22 is extended (`EnsureSlicePlaceholders`) with
  `/Engine/BasicShapes` meshes tinted through a dynamic material instance.
  The HUD is `AHUD` Canvas drawing. No `.uasset`, map, widget, animation or
  audio is added; the real art, UMG/CommonUI HUD and Enhanced Input assets
  are later tickets.
* **Tests run in a throwaway game world.** Automation tests use
  `IMPLEMENT_SIMPLE_AUTOMATION_TEST` and, where actors or subsystems are
  needed, `FBloodRitualTestWorld` (`UWorld::CreateWorld` + a world context).
  There is no game mode in that world, so `BeginPlay` does not run; tests
  register listeners and start clocks explicitly.

## Consequences

* Parts 2 and 3 add settings to the same class, implement the same two
  interfaces, bind `OnPhaseChanged` and call `EmitNoise`, `TrySpend` and
  `ResetToDay` as documented in ARCHITECTURE.md; they do not need to change
  part 1's shape.
* The placeholder test environment keeps growing until a real map ships;
  it is still scaffolding and goes away then.
* Everything in part 1 was written without compiling. The maintainer's
  first build and test run (docs/VALIDATION.md, section 7) is part of
  accepting the change.

# 0009. Vertical slice core systems: settings, day clock, noise delivery, supplies

Status: Accepted

## Context

The playable vertical slice is funded in three parts. Part 1 (ticket #23)
delivers the non-combat core that parts 2 (canoe, weapons, infected) and 3
(night defense, barricades, game flow) build on: tunable values, the
day/dusk/night clock, the noise event, looting into an inventory and
depositing into a hub stockpile. The constraints were: no compiler in the
authoring sandbox, so code must stick to well-known UE 5.8 APIs; placeholder
content only (no new binary assets); solo play only, but authoritative state
placed where later replication is not blocked.

## Decision

* **One `UDeveloperSettings` subclass, `USeminoleSettings`, holds every
  tunable.** Defaults live in C++, overrides go in `Config/DefaultGame.ini`
  (`[/Script/Seminole.SeminoleSettings]`) or Project Settings > Game >
  Seminole. Gameplay code calls `GetDefault<USeminoleSettings>()` and never
  hard-codes a duration, radius or amount. Values only later parts read (bow
  and rifle noise radii) are declared now.
* **The day clock is a `UTickableWorldSubsystem`,
  `USeminoleDayClockSubsystem`.** It runs Day → Dusk → Night from world
  begin-play and stops at Night; `ResetToDay()` restarts it. Time moves
  through a public `AdvanceTime(Seconds)` that `Tick` feeds, so tests step
  it deterministically. It broadcasts a native and a dynamic delegate on each
  transition. A world subsystem (rather than GameState) keeps it independent
  of the game mode and trivially available to tests; mirroring the phase to
  clients through `ASeminoleGameState` is a one-property change later.
* **Noise is delivered to explicitly registered `ISeminoleNoiseListener`s.**
  `USeminoleNoiseSubsystem::EmitNoise(Location, Radius, Instigator)` notifies
  every registered listener within `Radius` (3D distance) and then broadcasts
  `OnNoiseEmitted` for audio/UI/missions, as ADR 0004 requires. The ADR's
  provisional name `ReportNoise(..., Loudness, ..., Tag)` becomes
  `EmitNoise(..., Radius, ...)`; a tag can be added to `FSeminoleNoiseEvent`
  without changing callers. Forwarding to AI Perception hearing is part 2's
  job and happens in the same subsystem.
* **Supplies are an enum (`Food`, `Ammo`, `Materials`) with integer counts
  in a plain struct, `FSeminoleSupplyBundle`.** The same struct describes a
  container's contents, a pawn's `USeminoleInventoryComponent` and the
  stockpile. No item data assets yet: the slice needs counts, not items.
* **Stockpile totals live in `ASeminoleGameState`.** The hub actor
  `ASeminoleStockpile` is only the way players deposit;
  `ASeminoleGameState::TrySpend` is the single place part 3 pays for
  barricades and repairs. GameState is the natural replication home.
* **Interaction is a native interface, `ISeminoleInteractable`, found by
  distance.** `USeminoleInteractionComponent` picks the nearest interactable
  within `InteractionRange` that accepts the owner. Input is the legacy
  `Interact` action mapping (E) in `Config/DefaultInput.ini`, following the
  #22 pattern, because the project has no Enhanced Input assets yet.
* **The HUD is an `AHUD` drawing to the canvas.** No widget assets; replaced
  by UMG/CommonUI when the UI ticket is funded.
* **Placeholder actors extend `ASeminoleTestEnvironment`.** It spawns the
  hub stockpile, one container per `ContainerSupplies` entry and a
  placeholder noise listener, each only when the map has none, and carries
  the `USeminoleDayLightingComponent` that drives the lights from the clock.

## Consequences

* Parts 2 and 3 have fixed seams: implement `ISeminoleNoiseListener` on the
  infected; call `EmitNoise` with `BowNoiseRadius` / `RifleNoiseRadius` from
  weapons; implement `ISeminoleInteractable` on the canoe; bind to
  `OnPhaseChanged` for Night and call `ResetToDay()` after it; spend through
  `TrySpend`. None of these require changing part 1 code.
* All tunables are in one Project Settings page; designers can retune the
  slice without a compile.
* Tests (`Source/Seminole/Tests/`) run in a bare game world with no map or
  game mode, so they are fast and do not depend on content. They spawn the
  GameState themselves.
* The placeholder character gains two components (inventory, interaction)
  rather than being replaced; the real character inherits those components,
  not the placeholder.
* The noise subsystem scans a flat listener array per event. Fine for the
  slice's handful of listeners; a spatial index is a contained change if the
  infected population grows.

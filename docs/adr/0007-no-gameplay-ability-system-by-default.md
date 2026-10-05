# 0007. No Gameplay Ability System by default

Status: Accepted

## Context

The Gameplay Ability System (GAS) is Unreal's framework for abilities,
attributes and effects with built-in replication and prediction. It is
powerful, but it has a steep learning curve, pervasive boilerplate and
shapes every gameplay class around it. Seminole's needs are health, stamina,
hunger, a few weapons, melee and some status effects, in a small co-op game.

## Decision

* Do **not** adopt GAS by default.
* Model health, stamina, hunger, damage and status effects as plain
  `UActorComponent`s and data assets in `Source/Seminole/Survival/` and
  `Combat/`, replicated with standard property replication and RPCs.
* Revisit if a concrete feature needs predicted abilities, stacking effects
  with complex lifetimes, or a large ability catalogue. Adoption would be
  its own ADR and ticket.

## Consequences

* Lower barrier for contributors; smaller, readable systems.
* Some things GAS gives for free (effect stacking, attribute aggregation,
  cue routing) are written by hand if and when needed; keep them small.
* Full GAS adoption is explicitly out of scope for the vertical slice.

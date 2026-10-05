# 0003. StateTree AI without MassEntity at first

Status: Accepted

## Context

The infected need to idle, wander, react to noise, investigate, detect,
chase, attack, lose and search for players. Unreal offers Behavior Trees,
StateTree, and the MassEntity framework (with StateTree-driven Mass
processors) for very large populations. The vertical slice is one camp
defended at night, not a city-scale horde.

## Decision

* Drive each infected with **StateTree** on an `ACharacter`-based actor,
  using **AI Perception** (sight, hearing) and **NavMesh** movement.
* The state flow is
  `Idle -> Wander -> Hear Noise -> Investigate -> Detect Player -> Chase -> Attack -> Lose Player -> Search -> Wander`.
* StateTree tasks, conditions and evaluators are C++ in
  `Source/Seminole/AI/`; tree assets and tuning are under `Content/AI/`.
* **MassEntity is not used initially.** It remains an optional later step
  for distant or very large populations, with a hand-off to StateTree actors
  near players.
* Before any move to Mass, apply cheap distance tiers (tick rate, perception
  frequency, animation quality) to far-away infected.

## Consequences

* The AI is debuggable with the standard editor tools and simple to reason
  about on a listen server (host authority).
* Population size is bounded by actor cost; this is acceptable for the slice
  and is the explicit trade-off.
* The `StateTree` plugin is enabled by the AI ticket, not before.
* If Mass is adopted later, the state flow and noise interface stay the same;
  only the representation of distant infected changes.

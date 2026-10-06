# Survival

Health, hunger, stamina and the day/night cycle that drives the scavenge and defense phases.

Implemented (vertical slice part 1): `USeminoleDayClockComponent`, the Day -> Dusk -> Night clock owned by `ASeminoleGameState` (module root). Durations come from `USeminoleSettings`; `OnPhaseChanged` and `ResetToDay()` are the hooks for the night-defense ticket.
Health, hunger and stamina are not here yet.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).

# Survival

Health, hunger, stamina and the day/night cycle that drives the scavenge and defense phases.

Implemented (ticket #23):

* `USeminoleDayClockSubsystem`: the Day -> Dusk -> Night clock (durations from `USeminoleSettings`), with `OnPhaseChanged`, `GetTimeRemainingInPhase()`, `ResetToDay()` and a deterministic `AdvanceTime()`.
* `USeminoleDayLightingComponent`: interpolates the directional light and sky light between the configured day, dusk and night intensities.

Health, hunger and stamina are later tickets.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) and [ADR 0009](../../../docs/adr/0009-vertical-slice-core-systems.md).

# Interaction

Interactable actors and the interaction component: pick up, use, open, board a canoe.

Implemented (ticket #23):

* `ISeminoleInteractable`: `CanInteract()`, `GetInteractionPrompt()`, `Interact()`.
* `USeminoleInteractionComponent`: finds the nearest interactable within `USeminoleSettings::InteractionRange` and uses it on the `Interact` action (E).

See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) and [ADR 0009](../../../docs/adr/0009-vertical-slice-core-systems.md).

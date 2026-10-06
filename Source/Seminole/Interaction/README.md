# Interaction

Interactable actors and the interaction component: pick up, use, open, board a canoe.

Implemented (vertical slice part 1): `ISeminoleInteractable` (`CanInteract`, `Interact`, `GetInteractionPrompt`) and `USeminoleInteractionComponent`, which tracks the nearest interactable within `USeminoleSettings::InteractionRange` and uses it on the `Interact` action (E). New interactables implement the interface; nothing else needs to change.
See [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md).

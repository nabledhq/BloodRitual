// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "SeminoleInteractable.generated.h"

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class USeminoleInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * An actor the player can use with the Interact action: a container to search, the hub
 * stockpile to deposit into and, in part 2, the canoe to board.
 *
 * USeminoleInteractionComponent finds the nearest actor implementing this within range,
 * asks CanInteract(), shows GetInteractionPrompt() on the HUD and calls Interact() on input.
 */
class SEMINOLE_API ISeminoleInteractable
{
	GENERATED_BODY()

public:
	/** False hides the prompt and ignores input, e.g. for a container already searched. */
	virtual bool CanInteract(const AActor* Interactor) const { return true; }

	/** Short HUD text, e.g. "Search crate". */
	virtual FText GetInteractionPrompt(const AActor* Interactor) const = 0;

	/** Performs the interaction for Interactor (the player pawn). */
	virtual void Interact(AActor* Interactor) = 0;
};

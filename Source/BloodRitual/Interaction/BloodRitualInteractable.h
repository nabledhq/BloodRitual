// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "BloodRitualInteractable.generated.h"

class AActor;

UINTERFACE(MinimalAPI, meta = (CannotImplementInterfaceInBlueprint))
class UBloodRitualInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Something the player can use with the Interact action: part 1 has the supply container and
 * the stockpile; the canoe (part 2) and barricades (part 3) add theirs. Blueprint subclasses
 * of a C++ interactable inherit its implementation; the interface itself is C++ only.
 */
class BLOODRITUAL_API IBloodRitualInteractable
{
	GENERATED_BODY()

public:
	/** Whether Interact would do anything right now for this interactor. */
	virtual bool CanInteract(AActor* Interactor) const = 0;

	/** Performs the interaction. Only called when CanInteract returned true. */
	virtual void Interact(AActor* Interactor) = 0;

	/** Short HUD text such as "Search container" or "Searching..."; shown whether or not CanInteract. */
	virtual FText GetInteractionPrompt(AActor* Interactor) const = 0;
};

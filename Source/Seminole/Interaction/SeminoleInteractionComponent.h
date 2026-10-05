// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "SeminoleInteractionComponent.generated.h"

/**
 * Lets the owning pawn use ISeminoleInteractable actors.
 *
 * FindFocusedInteractable() picks the nearest interactable (that accepts the owner) within
 * USeminoleSettings::InteractionRange; TryInteract() calls Interact() on it. The pawn binds
 * TryInteract() to the Interact action; the HUD calls FindFocusedInteractable() for the prompt.
 *
 * The search is a distance test over the world's interactables, which is plenty for the
 * handful the slice spawns; a trace or overlap query can replace it without changing callers.
 */
UCLASS(ClassGroup = (Seminole), meta = (BlueprintSpawnableComponent))
class SEMINOLE_API USeminoleInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USeminoleInteractionComponent();

	/** The interactable the Interact action would use right now, or null. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Interaction")
	AActor* FindFocusedInteractable() const;

	/** Interacts with FindFocusedInteractable(). Returns true if something was used. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Interaction")
	bool TryInteract();
};

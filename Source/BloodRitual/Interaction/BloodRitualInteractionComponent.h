// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "BloodRitualInteractionComponent.generated.h"

/**
 * Finds the nearest IBloodRitualInteractable within UBloodRitualSettings::InteractionRange of the
 * owner every tick (the HUD shows its prompt) and uses it when the Interact action fires.
 *
 * The search walks every actor in the world, which is fine for the handful of placeholder
 * actors in the slice; an overlap query replaces it when a real map arrives.
 */
UCLASS(ClassGroup = (BloodRitual), meta = (BlueprintSpawnableComponent))
class BLOODRITUAL_API UBloodRitualInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UBloodRitualInteractionComponent();

	//~ UActorComponent
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Nearest interactable in range as of the last tick, or null. */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Interaction")
	AActor* GetFocusedInteractable() const { return FocusedInteractable.Get(); }

	/** Prompt of the focused interactable, or empty text. */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Interaction")
	FText GetFocusedPrompt() const;

	/** Interacts with the focused interactable if it allows it. Returns true when it did. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Interaction")
	bool TryInteract();

	/** Re-scans the world now; TickComponent calls this each frame. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Interaction")
	AActor* FindBestInteractable();

private:
	TWeakObjectPtr<AActor> FocusedInteractable;
};

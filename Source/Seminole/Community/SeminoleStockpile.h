// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/SeminoleInteractable.h"
#include "SeminoleStockpile.generated.h"

class UStaticMeshComponent;

/**
 * The hub stockpile: a tall placeholder block at camp. Interacting moves everything the
 * interactor carries (USeminoleInventoryComponent) into ASeminoleGameState's stockpile,
 * leaving the inventory at zero. The totals are the GameState's, not this actor's.
 */
UCLASS()
class SEMINOLE_API ASeminoleStockpile : public AActor, public ISeminoleInteractable
{
	GENERATED_BODY()

public:
	ASeminoleStockpile();

	// ISeminoleInteractable
	virtual bool CanInteract(const AActor* Interactor) const override;
	virtual FText GetInteractionPrompt(const AActor* Interactor) const override;
	virtual void Interact(AActor* Interactor) override;

protected:
	virtual void BeginPlay() override;

private:
	UPROPERTY(VisibleAnywhere, Category = "Seminole")
	TObjectPtr<UStaticMeshComponent> Mesh;
};

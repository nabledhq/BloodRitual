// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/SeminoleInteractable.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleSupplyContainer.generated.h"

class UStaticMeshComponent;

/**
 * A lootable container: a placeholder crate holding a configured FSeminoleSupplyBundle.
 *
 * Interact() starts a search of USeminoleSettings::ContainerSearchDurationSeconds (and emits a
 * noise of ContainerSearchNoiseRadius). When the search completes the supplies go to the
 * interactor's USeminoleInventoryComponent, the crate turns dark and it cannot be searched
 * again. The search advances in Tick() through AdvanceSearch(), which tests call directly.
 */
UCLASS()
class SEMINOLE_API ASeminoleSupplyContainer : public AActor, public ISeminoleInteractable
{
	GENERATED_BODY()

public:
	ASeminoleSupplyContainer();

	virtual void Tick(float DeltaSeconds) override;

	// ISeminoleInteractable
	virtual bool CanInteract(const AActor* Interactor) const override;
	virtual FText GetInteractionPrompt(const AActor* Interactor) const override;
	virtual void Interact(AActor* Interactor) override;

	/** Sets what the container grants. Has no effect once searched. */
	void SetSupplies(const FSeminoleSupplyBundle& InSupplies);
	const FSeminoleSupplyBundle& GetSupplies() const { return Supplies; }

	bool IsSearched() const { return bSearched; }
	bool IsBeingSearched() const { return Searcher.IsValid(); }

	/** 0 before a search starts, 1 when it completes. */
	float GetSearchProgress() const;

	/** Moves a running search forward by Seconds; completes it when the duration is reached. */
	void AdvanceSearch(float Seconds);

protected:
	virtual void BeginPlay() override;

private:
	void CompleteSearch();

	UPROPERTY(VisibleAnywhere, Category = "Seminole")
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** Granted on completion. Editable so a placed container can hold something specific. */
	UPROPERTY(EditAnywhere, Category = "Seminole")
	FSeminoleSupplyBundle Supplies;

	UPROPERTY(VisibleAnywhere, Category = "Seminole")
	bool bSearched = false;

	/** The actor searching right now; unset when idle. */
	TWeakObjectPtr<AActor> Searcher;

	float SearchElapsed = 0.0f;
};

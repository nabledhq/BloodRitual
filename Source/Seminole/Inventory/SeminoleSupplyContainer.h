// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/SeminoleInteractable.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleSupplyContainer.generated.h"

class UStaticMeshComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSeminoleContainerSearched, ASeminoleSupplyContainer*, Container, AActor*, Searcher);

/**
 * A lootable crate. Interacting starts a search that lasts
 * USeminoleSettings::ContainerSearchDurationSeconds; when it completes, the configured
 * Supplies go to the searcher's USeminoleInventoryComponent, the crate turns grey and can
 * never be searched again. Starting a search emits noise (ContainerSearchNoiseRadius).
 *
 * Timing runs through AdvanceSearch(), fed by Tick while a search is active and called
 * directly by tests, so the search is deterministic.
 */
UCLASS()
class SEMINOLE_API ASeminoleSupplyContainer : public AActor, public ISeminoleInteractable
{
	GENERATED_BODY()

public:
	ASeminoleSupplyContainer();

	//~ AActor
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	//~ ISeminoleInteractable
	virtual bool CanInteract(AActor* Interactor) const override;
	virtual void Interact(AActor* Interactor) override;
	virtual FText GetInteractionPrompt(AActor* Interactor) const override;

	/** What a successful search grants. Set before the first search (the test environment does). */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Container")
	void SetSupplies(const TArray<FSeminoleSupplyAmount>& InSupplies) { Supplies = InSupplies; }

	const TArray<FSeminoleSupplyAmount>& GetSupplies() const { return Supplies; }

	/** Starts the timed search. Returns false if the container is already searched or being searched. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Container")
	bool BeginSearch(AActor* Searcher);

	/** Moves an active search forward; completes it once the configured duration has elapsed. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Container")
	void AdvanceSearch(float DeltaSeconds);

	UFUNCTION(BlueprintPure, Category = "Seminole|Container")
	bool IsSearched() const { return bSearched; }

	UFUNCTION(BlueprintPure, Category = "Seminole|Container")
	bool IsBeingSearched() const { return bSearching; }

	/** 0..1 while a search is active; 1 once searched; 0 otherwise. */
	UFUNCTION(BlueprintPure, Category = "Seminole|Container")
	float GetSearchProgress() const;

	/** Fired once, when the search completes and the supplies have been granted. */
	UPROPERTY(BlueprintAssignable, Category = "Seminole|Container")
	FSeminoleContainerSearched OnSearched;

private:
	void FinishSearch();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(EditAnywhere, Category = "Seminole|Container")
	TArray<FSeminoleSupplyAmount> Supplies;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Container")
	bool bSearched = false;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Container")
	bool bSearching = false;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Container")
	float SearchElapsedSeconds = 0.0f;

	UPROPERTY(VisibleAnywhere, Category = "Seminole|Container")
	float SearchDurationSeconds = 0.0f;

	/** Who gets the supplies when the search completes. */
	TWeakObjectPtr<AActor> CurrentSearcher;
};

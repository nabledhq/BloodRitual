// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/BloodRitualInteractable.h"
#include "Inventory/BloodRitualSupplyTypes.h"
#include "BloodRitualSupplyContainer.generated.h"

class ABloodRitualSupplyContainer;
class UStaticMesh;
class UStaticMeshComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FBloodRitualContainerSearched, ABloodRitualSupplyContainer*, Container, AActor*, Searcher);

/**
 * A lootable container: a crate, a barrel or a basket (SetVisualVariant). Interacting starts a
 * search that lasts UBloodRitualSettings::ContainerSearchDurationSeconds; when it completes, the
 * configured Supplies go to the searcher's UBloodRitualInventoryComponent, the container darkens and
 * can never be searched again. Starting a search emits noise (ContainerSearchNoiseRadius).
 * The actor's origin is at the base of the model.
 *
 * Timing runs through AdvanceSearch(), fed by Tick while a search is active and called
 * directly by tests, so the search is deterministic.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualSupplyContainer : public AActor, public IBloodRitualInteractable
{
	GENERATED_BODY()

public:
	ABloodRitualSupplyContainer();

	//~ AActor
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	//~ IBloodRitualInteractable
	virtual bool CanInteract(AActor* Interactor) const override;
	virtual void Interact(AActor* Interactor) override;
	virtual FText GetInteractionPrompt(AActor* Interactor) const override;

	/** What a successful search grants. Set before the first search (the test environment does). */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Container")
	void SetSupplies(const TArray<FBloodRitualSupplyAmount>& InSupplies) { Supplies = InSupplies; }

	const TArray<FBloodRitualSupplyAmount>& GetSupplies() const { return Supplies; }

	/** Picks the model: 0 crate, 1 barrel, 2 basket; other values wrap around. */
	void SetVisualVariant(int32 Variant);

	/** Starts the timed search. Returns false if the container is already searched or being searched. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Container")
	bool BeginSearch(AActor* Searcher);

	/** Moves an active search forward; completes it once the configured duration has elapsed. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Container")
	void AdvanceSearch(float DeltaSeconds);

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Container")
	bool IsSearched() const { return bSearched; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Container")
	bool IsBeingSearched() const { return bSearching; }

	/** 0..1 while a search is active; 1 once searched; 0 otherwise. */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Container")
	float GetSearchProgress() const;

	/** Fired once, when the search completes and the supplies have been granted. */
	UPROPERTY(BlueprintAssignable, Category = "BloodRitual|Container")
	FBloodRitualContainerSearched OnSearched;

private:
	void FinishSearch();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** One model per visual variant, resolved in the constructor; null entries use FallbackMesh. */
	UPROPERTY()
	TArray<TObjectPtr<UStaticMesh>> VariantMeshes;

	/** /Engine/BasicShapes/Cube, used when a variant's model is missing. */
	UPROPERTY()
	TObjectPtr<UStaticMesh> FallbackMesh;

	UPROPERTY(EditAnywhere, Category = "BloodRitual|Container")
	TArray<FBloodRitualSupplyAmount> Supplies;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Container")
	bool bSearched = false;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Container")
	bool bSearching = false;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Container")
	float SearchElapsedSeconds = 0.0f;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Container")
	float SearchDurationSeconds = 0.0f;

	/** Who gets the supplies when the search completes. */
	TWeakObjectPtr<AActor> CurrentSearcher;
};

// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/BloodRitualInteractable.h"
#include "Inventory/BloodRitualSupplyTypes.h"
#include "BloodRitualStockpile.generated.h"

class UBloodRitualInventoryComponent;
class UStaticMeshComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FBloodRitualStockpileChanged);

/**
 * The camp's shared supply store at the hub. Interacting deposits everything the interactor's
 * UBloodRitualInventoryComponent carries. The totals held here are the authoritative camp state:
 * the stockpile is spawned by the authority (game mode) and its Supplies can be marked
 * Replicated when the networking ticket lands.
 *
 * It looks like a stack of camp stores: a long crate (the root, which takes the interaction) with
 * a barrel at one end and a smaller crate on top. The actor's origin is at the base.
 *
 * Extension point: TrySpend() is what part 3's barricades and repairs draw from.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualStockpile : public AActor, public IBloodRitualInteractable
{
	GENERATED_BODY()

public:
	ABloodRitualStockpile();

	//~ AActor
	virtual void BeginPlay() override;

	//~ IBloodRitualInteractable
	virtual bool CanInteract(AActor* Interactor) const override;
	virtual void Interact(AActor* Interactor) override;
	virtual FText GetInteractionPrompt(AActor* Interactor) const override;

	/** Moves everything in From into the stockpile and returns what was moved. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Stockpile")
	FBloodRitualSupplyCounts DepositAll(UBloodRitualInventoryComponent* From);

	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Stockpile")
	void AddSupply(EBloodRitualSupplyType Type, int32 Amount);

	/** Removes Amount of Type. Returns false, changing nothing, when the stockpile holds fewer. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Stockpile")
	bool TrySpend(EBloodRitualSupplyType Type, int32 Amount);

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Stockpile")
	int32 GetSupplyCount(EBloodRitualSupplyType Type) const { return Supplies.Get(Type); }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Stockpile")
	FBloodRitualSupplyCounts GetSupplies() const { return Supplies; }

	/** Fired after every deposit or spend. */
	UPROPERTY(BlueprintAssignable, Category = "BloodRitual|Stockpile")
	FBloodRitualStockpileChanged OnStockpileChanged;

private:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** Decoration beside and on top of the main crate; empty when the models are missing. */
	UPROPERTY(VisibleAnywhere, Category = "BloodRitual")
	TObjectPtr<UStaticMeshComponent> Barrel;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual")
	TObjectPtr<UStaticMeshComponent> TopCrate;

	/** True when the models were missing and Mesh shows the green /Engine/BasicShapes cube instead. */
	bool bUsingFallbackMesh = false;

	/** Authoritative totals. */
	UPROPERTY(VisibleAnywhere, Category = "BloodRitual|Stockpile")
	FBloodRitualSupplyCounts Supplies;
};

// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/SeminoleInteractable.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleStockpile.generated.h"

class USeminoleInventoryComponent;
class UStaticMeshComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSeminoleStockpileChanged);

/**
 * The camp's shared supply store at the hub. Interacting deposits everything the interactor's
 * USeminoleInventoryComponent carries. The totals held here are the authoritative camp state:
 * the stockpile is spawned by the authority (game mode) and its Supplies can be marked
 * Replicated when the networking ticket lands.
 *
 * Extension point: TrySpend() is what part 3's barricades and repairs draw from.
 */
UCLASS()
class SEMINOLE_API ASeminoleStockpile : public AActor, public ISeminoleInteractable
{
	GENERATED_BODY()

public:
	ASeminoleStockpile();

	//~ AActor
	virtual void BeginPlay() override;

	//~ ISeminoleInteractable
	virtual bool CanInteract(AActor* Interactor) const override;
	virtual void Interact(AActor* Interactor) override;
	virtual FText GetInteractionPrompt(AActor* Interactor) const override;

	/** Moves everything in From into the stockpile and returns what was moved. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Stockpile")
	FSeminoleSupplyCounts DepositAll(USeminoleInventoryComponent* From);

	UFUNCTION(BlueprintCallable, Category = "Seminole|Stockpile")
	void AddSupply(ESeminoleSupplyType Type, int32 Amount);

	/** Removes Amount of Type. Returns false, changing nothing, when the stockpile holds fewer. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Stockpile")
	bool TrySpend(ESeminoleSupplyType Type, int32 Amount);

	UFUNCTION(BlueprintPure, Category = "Seminole|Stockpile")
	int32 GetSupplyCount(ESeminoleSupplyType Type) const { return Supplies.Get(Type); }

	UFUNCTION(BlueprintPure, Category = "Seminole|Stockpile")
	FSeminoleSupplyCounts GetSupplies() const { return Supplies; }

	/** Fired after every deposit or spend. */
	UPROPERTY(BlueprintAssignable, Category = "Seminole|Stockpile")
	FSeminoleStockpileChanged OnStockpileChanged;

private:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UStaticMeshComponent> Mesh;

	/** Authoritative totals. */
	UPROPERTY(VisibleAnywhere, Category = "Seminole|Stockpile")
	FSeminoleSupplyCounts Supplies;
};

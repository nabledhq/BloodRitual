// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleInventoryComponent.generated.h"

DECLARE_MULTICAST_DELEGATE_OneParam(FSeminoleInventoryChangedNative, const FSeminoleSupplyBundle& /*Supplies*/);

/**
 * What a pawn carries: an integer count per ESeminoleSupplyType.
 *
 * Containers add to it, the hub stockpile empties it with TakeAll(). Only the owning
 * authority should mutate it; the counts are plain state so they can be replicated later.
 */
UCLASS(ClassGroup = (Seminole), meta = (BlueprintSpawnableComponent))
class SEMINOLE_API USeminoleInventoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USeminoleInventoryComponent();

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	int32 GetSupplyCount(ESeminoleSupplyType Type) const { return Supplies.Get(Type); }

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	FSeminoleSupplyBundle GetSupplies() const { return Supplies; }

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	bool IsEmpty() const { return Supplies.IsEmpty(); }

	/** Adds Amount (ignored when <= 0) of one type. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	void AddSupplies(ESeminoleSupplyType Type, int32 Amount);

	/** Adds every count in Bundle. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	void AddBundle(const FSeminoleSupplyBundle& Bundle);

	/** Removes Amount of one type. Returns false, changing nothing, if fewer are carried. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	bool RemoveSupplies(ESeminoleSupplyType Type, int32 Amount);

	/** Empties the inventory and returns what it held. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	FSeminoleSupplyBundle TakeAll();

	/** Fired after any change, with the new counts. */
	FSeminoleInventoryChangedNative OnInventoryChanged;

private:
	UPROPERTY(VisibleAnywhere, Category = "Seminole")
	FSeminoleSupplyBundle Supplies;
};

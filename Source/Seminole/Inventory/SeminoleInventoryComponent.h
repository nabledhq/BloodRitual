// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleInventoryComponent.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FSeminoleInventoryChanged);

/**
 * Carried supplies: an integer count per ESeminoleSupplyType on the player pawn. Containers add
 * to it, the stockpile takes everything out of it. No items, slots or weight; that is the
 * later Inventory ticket.
 */
UCLASS(ClassGroup = (Seminole), meta = (BlueprintSpawnableComponent))
class SEMINOLE_API USeminoleInventoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USeminoleInventoryComponent();

	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	void AddSupply(ESeminoleSupplyType Type, int32 Amount);

	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	void AddSupplies(const TArray<FSeminoleSupplyAmount>& Amounts);

	/** Removes Amount of Type. Returns false, changing nothing, when fewer are carried. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	bool RemoveSupply(ESeminoleSupplyType Type, int32 Amount);

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	int32 GetSupplyCount(ESeminoleSupplyType Type) const { return Supplies.Get(Type); }

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	int32 GetTotalSupplyCount() const { return Supplies.Total(); }

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	bool IsEmpty() const { return Supplies.IsEmpty(); }

	UFUNCTION(BlueprintPure, Category = "Seminole|Inventory")
	FSeminoleSupplyCounts GetSupplies() const { return Supplies; }

	/** Empties the inventory and returns what it held (used by the stockpile deposit). */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Inventory")
	FSeminoleSupplyCounts TakeAll();

	/** Fired after every change. The HUD reads the counts directly, so no payload. */
	UPROPERTY(BlueprintAssignable, Category = "Seminole|Inventory")
	FSeminoleInventoryChanged OnInventoryChanged;

private:
	UPROPERTY(VisibleAnywhere, Category = "Seminole|Inventory")
	FSeminoleSupplyCounts Supplies;
};

// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "Inventory/SeminoleSupplyTypes.h"
#include "SeminoleGameState.generated.h"

DECLARE_MULTICAST_DELEGATE_OneParam(FSeminoleStockpileChangedNative, const FSeminoleSupplyBundle& /*Stockpile*/);

/**
 * Authoritative match state shared by all players. Today that is the hub stockpile:
 * the supplies deposited at camp, which part 3 spends on barricades and repairs.
 *
 * ASeminoleStockpile (the actor at the hub) is the way players deposit; the totals live
 * here so a later ticket can replicate them with a single Replicated property.
 */
UCLASS()
class SEMINOLE_API ASeminoleGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintPure, Category = "Seminole|Stockpile")
	FSeminoleSupplyBundle GetStockpile() const { return Stockpile; }

	UFUNCTION(BlueprintPure, Category = "Seminole|Stockpile")
	int32 GetStockpileCount(ESeminoleSupplyType Type) const { return Stockpile.Get(Type); }

	/** Adds every count in Bundle to the stockpile. */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Stockpile")
	void DepositSupplies(const FSeminoleSupplyBundle& Bundle);

	/**
	 * Removes Amount of Type if the stockpile holds at least that many. Returns false and
	 * changes nothing otherwise. Part 3 pays for barricades and repairs through this.
	 */
	UFUNCTION(BlueprintCallable, Category = "Seminole|Stockpile")
	bool TrySpend(ESeminoleSupplyType Type, int32 Amount);

	/** Fired after every deposit or successful spend, with the new totals. */
	FSeminoleStockpileChangedNative OnStockpileChanged;

private:
	UPROPERTY(VisibleAnywhere, Category = "Seminole")
	FSeminoleSupplyBundle Stockpile;
};

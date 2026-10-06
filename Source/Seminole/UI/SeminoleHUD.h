// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SeminoleHUD.generated.h"

class ASeminoleStockpile;
class USeminoleDayClockComponent;

/**
 * Canvas-drawn HUD (no widget assets): the day phase and time remaining, a dusk warning,
 * the carried supplies, the stockpile totals, and the prompt of the interactable in reach
 * with a progress bar while a container is being searched. Set by ASeminoleGameMode.
 */
UCLASS()
class SEMINOLE_API ASeminoleHUD : public AHUD
{
	GENERATED_BODY()

public:
	//~ AHUD
	virtual void DrawHUD() override;

private:
	USeminoleDayClockComponent* GetDayClock() const;
	ASeminoleStockpile* GetStockpile();

	void DrawClock(const USeminoleDayClockComponent* Clock, float& Y);
	void DrawSupplies(float& Y);
	void DrawInteraction();

	/** The one stockpile of the slice, found once and cached. */
	TWeakObjectPtr<ASeminoleStockpile> CachedStockpile;
};

// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "BloodRitualHUD.generated.h"

class ABloodRitualStockpile;
class UBloodRitualDayClockComponent;

/**
 * Canvas-drawn HUD (no widget assets): the day phase and time remaining, a dusk warning,
 * the carried supplies, the stockpile totals, the prompt of the interactable in reach with a
 * progress bar while a container is being searched, and the combat readout: health, the held
 * weapon with its ammunition, a crosshair for ranged weapons with a hit marker, and a notice
 * while dead. Set by ABloodRitualGameMode.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualHUD : public AHUD
{
	GENERATED_BODY()

public:
	//~ AHUD
	virtual void DrawHUD() override;

private:
	UBloodRitualDayClockComponent* GetDayClock() const;
	ABloodRitualStockpile* GetStockpile();

	void DrawClock(const UBloodRitualDayClockComponent* Clock, float& Y);
	void DrawSupplies(float& Y);
	void DrawInteraction();
	void DrawCombat();

	/** The one stockpile of the slice, found once and cached. */
	TWeakObjectPtr<ABloodRitualStockpile> CachedStockpile;
};

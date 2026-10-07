// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "BloodRitualGameState.generated.h"

class UBloodRitualDayClockComponent;

/**
 * Project game state (set by ABloodRitualGameMode). Owns the day clock so the current phase is
 * authoritative, host-owned state: when the networking ticket lands, the clock's phase and
 * time remaining can be replicated from here without moving them.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	ABloodRitualGameState();

	UFUNCTION(BlueprintPure, Category = "BloodRitual")
	UBloodRitualDayClockComponent* GetDayClock() const { return DayClock; }

private:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UBloodRitualDayClockComponent> DayClock;
};

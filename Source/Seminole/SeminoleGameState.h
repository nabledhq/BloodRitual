// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameStateBase.h"
#include "SeminoleGameState.generated.h"

class USeminoleDayClockComponent;

/**
 * Project game state (set by ASeminoleGameMode). Owns the day clock so the current phase is
 * authoritative, host-owned state: when the networking ticket lands, the clock's phase and
 * time remaining can be replicated from here without moving them.
 */
UCLASS()
class SEMINOLE_API ASeminoleGameState : public AGameStateBase
{
	GENERATED_BODY()

public:
	ASeminoleGameState();

	UFUNCTION(BlueprintPure, Category = "Seminole")
	USeminoleDayClockComponent* GetDayClock() const { return DayClock; }

private:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Seminole", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USeminoleDayClockComponent> DayClock;
};

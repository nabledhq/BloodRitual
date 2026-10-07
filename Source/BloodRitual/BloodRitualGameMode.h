// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "BloodRitualGameMode.generated.h"

/**
 * Project default game mode (Config/DefaultEngine.ini, GlobalDefaultGameMode).
 *
 * Spawns ABloodRitualProtagonistCharacter for each player and, before any player is spawned,
 * makes sure the current map has a floor, a directional light, a sky light and a PlayerStart
 * (see ABloodRitualTestEnvironment). This lets the project boot into the empty engine map
 * /Engine/Maps/Entry without any authored content.
 *
 * Vertical slice part 1: uses ABloodRitualGameState (owns the day clock) and ABloodRitualHUD, and
 * asks the test environment for the stockpile, containers and noise listener placeholders.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ABloodRitualGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
};

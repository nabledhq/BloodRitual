// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "SeminoleGameMode.generated.h"

/**
 * Project default game mode (Config/DefaultEngine.ini, GlobalDefaultGameMode).
 *
 * Spawns ASeminolePlaceholderCharacter for each player and, before any player is spawned,
 * makes sure the current map has a floor, a directional light, a sky light and a PlayerStart
 * (see ASeminoleTestEnvironment). This lets the project boot into the empty engine map
 * /Engine/Maps/Entry without any authored content.
 */
UCLASS()
class SEMINOLE_API ASeminoleGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ASeminoleGameMode();

	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
};

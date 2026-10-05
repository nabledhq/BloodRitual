// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleGameMode.h"

#include "Seminole.h"
#include "SeminoleGameState.h"
#include "SeminoleHUD.h"
#include "SeminolePlaceholderCharacter.h"
#include "SeminoleTestEnvironment.h"
#include "Engine/World.h"
#include "EngineUtils.h"

ASeminoleGameMode::ASeminoleGameMode()
{
	DefaultPawnClass = ASeminolePlaceholderCharacter::StaticClass();
	GameStateClass = ASeminoleGameState::StaticClass();
	HUDClass = ASeminoleHUD::StaticClass();
}

void ASeminoleGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);

	UWorld* World = GetWorld();
	if (World == nullptr)
	{
		return;
	}

	// InitGame runs after the level's actors are registered and before the first player logs in,
	// so anything spawned here (in particular the PlayerStart) is in place for the spawn.
	ASeminoleTestEnvironment* TestEnvironment = nullptr;
	for (TActorIterator<ASeminoleTestEnvironment> It(World); It; ++It)
	{
		TestEnvironment = *It;
		break;
	}

	if (TestEnvironment == nullptr)
	{
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		TestEnvironment = World->SpawnActor<ASeminoleTestEnvironment>(SpawnParams);
	}

	if (TestEnvironment == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleGameMode: could not spawn ASeminoleTestEnvironment in %s."), *MapName);
		return;
	}

	TestEnvironment->EnsureSceneBasics();
	TestEnvironment->EnsureSliceActors();
}

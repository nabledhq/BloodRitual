// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualGameMode.h"

#include "BloodRitual.h"
#include "BloodRitualGameState.h"
#include "BloodRitualProtagonistCharacter.h"
#include "BloodRitualTestEnvironment.h"
#include "UI/BloodRitualHUD.h"
#include "Engine/World.h"
#include "EngineUtils.h"

ABloodRitualGameMode::ABloodRitualGameMode()
{
	DefaultPawnClass = ABloodRitualProtagonistCharacter::StaticClass();
	GameStateClass = ABloodRitualGameState::StaticClass();
	HUDClass = ABloodRitualHUD::StaticClass();
}

void ABloodRitualGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);

	UWorld* World = GetWorld();
	if (World == nullptr)
	{
		return;
	}

	// InitGame runs after the level's actors are registered and before the first player logs in,
	// so anything spawned here (in particular the PlayerStart) is in place for the spawn.
	ABloodRitualTestEnvironment* TestEnvironment = nullptr;
	for (TActorIterator<ABloodRitualTestEnvironment> It(World); It; ++It)
	{
		TestEnvironment = *It;
		break;
	}

	if (TestEnvironment == nullptr)
	{
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		TestEnvironment = World->SpawnActor<ABloodRitualTestEnvironment>(SpawnParams);
	}

	if (TestEnvironment == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualGameMode: could not spawn ABloodRitualTestEnvironment in %s."), *MapName);
		return;
	}

	TestEnvironment->EnsureSceneBasics();
	TestEnvironment->EnsureSlicePlaceholders();
}

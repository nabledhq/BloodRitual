// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Engine/Engine.h"
#include "Engine/World.h"

/**
 * A throwaway game world for automation tests: created on construction, torn down on
 * destruction. Actors can be spawned and world subsystems resolved; there is no game mode,
 * so actor BeginPlay does not run (tests register listeners and reset clocks explicitly).
 */
struct FBloodRitualTestWorld
{
	FBloodRitualTestWorld()
	{
		World = UWorld::CreateWorld(EWorldType::Game, false);
		FWorldContext& WorldContext = GEngine->CreateNewWorldContext(EWorldType::Game);
		WorldContext.SetCurrentWorld(World);

		const FURL URL;
		World->InitializeActorsForPlay(URL);
	}

	~FBloodRitualTestWorld()
	{
		if (World != nullptr)
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
			World = nullptr;
		}
	}

	FBloodRitualTestWorld(const FBloodRitualTestWorld&) = delete;
	FBloodRitualTestWorld& operator=(const FBloodRitualTestWorld&) = delete;

	UWorld* GetWorld() const { return World; }

	template <typename TActor>
	TActor* SpawnActor(const FVector& Location = FVector::ZeroVector) const
	{
		FActorSpawnParameters SpawnParams;
		SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		return World->SpawnActor<TActor>(TActor::StaticClass(), Location, FRotator::ZeroRotator, SpawnParams);
	}

private:
	UWorld* World = nullptr;
};

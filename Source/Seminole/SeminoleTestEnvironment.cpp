// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleTestEnvironment.h"

#include "Seminole.h"
#include "SeminoleSettings.h"
#include "Community/SeminoleStockpile.h"
#include "Inventory/SeminoleSupplyContainer.h"
#include "Survival/SeminoleDayLightingComponent.h"
#include "World/SeminoleNoiseListenerPlaceholder.h"
#include "CollisionQueryParams.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerStart.h"
#include "UObject/ConstructorHelpers.h"

const FName ASeminoleTestEnvironment::FloorTag(TEXT("SeminoleFloor"));
// A few steps behind the PlayerStart (which faces +X); turn around to see it.
const FVector ASeminoleTestEnvironment::HubLocation(-600.0f, 0.0f, 0.0f);
// 30 m straight ahead of the PlayerStart: far enough to be a trip, well inside the 100 m floor.
const FVector ASeminoleTestEnvironment::ScavengingAreaLocation(3000.0f, 0.0f, 0.0f);

namespace
{
	// /Engine/BasicShapes/Cube is 1 m on each side; this scale gives a 100 m x 100 m x 1 m slab.
	const FVector FloorScale(100.0f, 100.0f, 1.0f);
	// Centre of the slab, so its top surface sits at Z = 0.
	const FVector FloorLocation(0.0f, 0.0f, -50.0f);
	// Above the floor by more than the default capsule half height (88), so the pawn drops onto it.
	const FVector PlayerStartLocation(0.0f, 0.0f, 120.0f);
	// Pitch -50 points the sun down; the yaw just keeps the shadows off-axis.
	const FRotator SunRotation(-50.0f, 30.0f, 0.0f);
	// Gap between neighbouring containers at the scavenging area.
	const float ContainerSpacing = 300.0f;
	// The noise listener sits beside the containers, inside the configured search noise radius.
	const FVector NoiseListenerOffset(400.0f, 400.0f, 0.0f);

	template <typename TActor>
	bool WorldHasActorOfClass(const UWorld* World)
	{
		TActorIterator<TActor> It(World);
		return static_cast<bool>(It);
	}

	template <typename TComponent>
	bool WorldHasComponentOfClass(const UWorld* World)
	{
		for (TActorIterator<AActor> It(World); It; ++It)
		{
			if (It->FindComponentByClass<TComponent>() != nullptr)
			{
				return true;
			}
		}
		return false;
	}
}

ASeminoleTestEnvironment::ASeminoleTestEnvironment()
{
	PrimaryActorTick.bCanEverTick = false;

	ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		FloorMesh = CubeFinder.Object;
	}

	DayLighting = CreateDefaultSubobject<USeminoleDayLightingComponent>(TEXT("DayLighting"));
}

void ASeminoleTestEnvironment::EnsureSceneBasics()
{
	if (GetWorld() == nullptr)
	{
		return;
	}

	// The floor goes first so the PlayerStart has something beneath it when it initialises.
	if (!HasFloor())
	{
		SpawnFloor();
	}
	if (!HasDirectionalLight())
	{
		SpawnDirectionalLight();
	}
	if (!HasSkyLight())
	{
		SpawnSkyLight();
	}
	if (!HasPlayerStart())
	{
		SpawnPlayerStart();
	}
}

void ASeminoleTestEnvironment::EnsureSliceActors()
{
	const UWorld* World = GetWorld();
	if (World == nullptr)
	{
		return;
	}

	if (!WorldHasActorOfClass<ASeminoleStockpile>(World))
	{
		SpawnStockpile();
	}
	if (!WorldHasActorOfClass<ASeminoleSupplyContainer>(World))
	{
		SpawnContainers();
	}
	if (!WorldHasActorOfClass<ASeminoleNoiseListenerPlaceholder>(World))
	{
		SpawnNoiseListener();
	}
}

bool ASeminoleTestEnvironment::HasFloor() const
{
	const UWorld* World = GetWorld();

	// A floor spawned by this class or by create_test_map.py carries FloorTag.
	for (TActorIterator<AStaticMeshActor> It(World); It; ++It)
	{
		if (It->ActorHasTag(FloorTag))
		{
			return true;
		}
	}

	// Otherwise any static geometry under the origin counts, so hand-made maps keep their own ground.
	FHitResult Hit;
	const FCollisionQueryParams Params(TEXT("SeminoleFloorProbe"), /*bInTraceComplex*/ false);
	const FVector ProbeStart(0.0f, 0.0f, 100000.0f);
	const FVector ProbeEnd(0.0f, 0.0f, -100000.0f);
	return World->LineTraceSingleByChannel(Hit, ProbeStart, ProbeEnd, ECC_WorldStatic, Params);
}

bool ASeminoleTestEnvironment::HasDirectionalLight() const
{
	return WorldHasComponentOfClass<UDirectionalLightComponent>(GetWorld());
}

bool ASeminoleTestEnvironment::HasSkyLight() const
{
	return WorldHasComponentOfClass<USkyLightComponent>(GetWorld());
}

bool ASeminoleTestEnvironment::HasPlayerStart() const
{
	return WorldHasActorOfClass<APlayerStart>(GetWorld());
}

void ASeminoleTestEnvironment::SpawnFloor()
{
	if (FloorMesh == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: /Engine/BasicShapes/Cube not found, no floor spawned."));
		return;
	}

	// Deferred spawn: the mesh and collision are set before the component registers, which is
	// the only point at which the Static-mobility component of an AStaticMeshActor accepts a new mesh.
	const FTransform FloorTransform(FRotator::ZeroRotator, FloorLocation, FloorScale);
	AStaticMeshActor* Floor = GetWorld()->SpawnActorDeferred<AStaticMeshActor>(
		AStaticMeshActor::StaticClass(), FloorTransform, this, nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (Floor == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn the floor."));
		return;
	}

	Floor->Tags.Add(FloorTag);
#if WITH_EDITOR
	Floor->SetActorLabel(TEXT("SeminoleFloor"));
#endif

	UStaticMeshComponent* FloorComponent = Floor->GetStaticMeshComponent();
	FloorComponent->SetStaticMesh(FloorMesh);
	FloorComponent->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	FloorComponent->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	Floor->FinishSpawning(FloorTransform);
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned a %.0f m x %.0f m floor."), FloorScale.X, FloorScale.Y);
}

void ASeminoleTestEnvironment::SpawnDirectionalLight()
{
	const FTransform LightTransform(SunRotation, FVector(0.0f, 0.0f, 500.0f));
	ADirectionalLight* Sun = GetWorld()->SpawnActorDeferred<ADirectionalLight>(
		ADirectionalLight::StaticClass(), LightTransform, this, nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (Sun == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn the directional light."));
		return;
	}

#if WITH_EDITOR
	Sun->SetActorLabel(TEXT("SeminoleSun"));
#endif
	// Runtime-spawned lights cannot have baked lighting, so they must be movable.
	Sun->GetLightComponent()->SetMobility(EComponentMobility::Movable);

	Sun->FinishSpawning(LightTransform);
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned a movable directional light."));
}

void ASeminoleTestEnvironment::SpawnSkyLight()
{
	const FTransform LightTransform(FRotator::ZeroRotator, FVector(0.0f, 0.0f, 500.0f));
	ASkyLight* Sky = GetWorld()->SpawnActorDeferred<ASkyLight>(
		ASkyLight::StaticClass(), LightTransform, this, nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (Sky == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn the sky light."));
		return;
	}

#if WITH_EDITOR
	Sky->SetActorLabel(TEXT("SeminoleSkyLight"));
#endif
	Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);

	Sky->FinishSpawning(LightTransform);
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned a movable sky light."));
}

void ASeminoleTestEnvironment::SpawnPlayerStart()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	APlayerStart* Start = GetWorld()->SpawnActor<APlayerStart>(
		APlayerStart::StaticClass(), PlayerStartLocation, FRotator::ZeroRotator, SpawnParams);
	if (Start == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn the PlayerStart."));
		return;
	}

#if WITH_EDITOR
	Start->SetActorLabel(TEXT("SeminolePlayerStart"));
#endif
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned a PlayerStart at %s."), *PlayerStartLocation.ToString());
}

void ASeminoleTestEnvironment::SpawnStockpile()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	ASeminoleStockpile* Stockpile = GetWorld()->SpawnActor<ASeminoleStockpile>(
		ASeminoleStockpile::StaticClass(), HubLocation, FRotator::ZeroRotator, SpawnParams);
	if (Stockpile == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn the hub stockpile."));
		return;
	}

#if WITH_EDITOR
	Stockpile->SetActorLabel(TEXT("SeminoleHubStockpile"));
#endif
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned the hub stockpile at %s."), *HubLocation.ToString());
}

void ASeminoleTestEnvironment::SpawnContainers()
{
	const TArray<FSeminoleSupplyBundle>& Bundles = GetDefault<USeminoleSettings>()->ContainerSupplies;
	if (Bundles.Num() == 0)
	{
		UE_LOG(LogSeminole, Warning, TEXT("SeminoleTestEnvironment: USeminoleSettings::ContainerSupplies is empty, no containers spawned."));
		return;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	// Centre the row of containers on the scavenging area.
	const float RowStartY = -0.5f * ContainerSpacing * (Bundles.Num() - 1);
	int32 Spawned = 0;
	for (int32 Index = 0; Index < Bundles.Num(); ++Index)
	{
		const FVector Location = ScavengingAreaLocation + FVector(0.0f, RowStartY + Index * ContainerSpacing, 0.0f);
		ASeminoleSupplyContainer* Container = GetWorld()->SpawnActor<ASeminoleSupplyContainer>(
			ASeminoleSupplyContainer::StaticClass(), Location, FRotator::ZeroRotator, SpawnParams);
		if (Container == nullptr)
		{
			UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn supply container %d."), Index);
			continue;
		}

		Container->SetSupplies(Bundles[Index]);
#if WITH_EDITOR
		Container->SetActorLabel(FString::Printf(TEXT("SeminoleSupplyContainer%d"), Index + 1));
#endif
		++Spawned;
	}
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned %d supply containers at %s."), Spawned, *ScavengingAreaLocation.ToString());
}

void ASeminoleTestEnvironment::SpawnNoiseListener()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	const FVector Location = ScavengingAreaLocation + NoiseListenerOffset;
	ASeminoleNoiseListenerPlaceholder* Listener = GetWorld()->SpawnActor<ASeminoleNoiseListenerPlaceholder>(
		ASeminoleNoiseListenerPlaceholder::StaticClass(), Location, FRotator::ZeroRotator, SpawnParams);
	if (Listener == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("SeminoleTestEnvironment: failed to spawn the placeholder noise listener."));
		return;
	}

#if WITH_EDITOR
	Listener->SetActorLabel(TEXT("SeminoleNoiseListener"));
#endif
	UE_LOG(LogSeminole, Log, TEXT("SeminoleTestEnvironment: spawned a placeholder noise listener at %s."), *Location.ToString());
}

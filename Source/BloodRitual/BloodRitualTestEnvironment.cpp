// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualTestEnvironment.h"

#include "BloodRitual.h"
#include "BloodRitualSettings.h"
#include "Community/BloodRitualStockpile.h"
#include "Inventory/BloodRitualSupplyContainer.h"
#include "World/BloodRitualDayLightingComponent.h"
#include "World/BloodRitualNoiseListenerPlaceholder.h"
#include "CollisionQueryParams.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyAtmosphereComponent.h"
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
#include "Materials/MaterialInterface.h"
#include "Math/RandomStream.h"
#include "BloodRitualPlaceholderVisuals.h"
#include "UObject/ConstructorHelpers.h"

const FName ABloodRitualTestEnvironment::FloorTag(TEXT("BloodRitualFloor"));
const FName ABloodRitualTestEnvironment::SceneryTag(TEXT("BloodRitualScenery"));

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

	// Vertical slice layout. The hub is the PlayerStart; the stockpile stands 4 m in front of it.
	// The scavenging area is 30 m away along +X, far enough to be a walk and still in view.
	// The stockpile and containers have their origin at their base, so Z = 0 rests on the floor.
	const FVector HubStockpileLocation(400.0f, 0.0f, 0.0f);
	const FVector ScavengingAreaLocation(3000.0f, 0.0f, 0.0f);
	const float ContainerSpacing = 250.0f;
	// The listener sphere (1 m) sits beyond the containers, inside the search noise radius.
	const FVector NoiseListenerOffset(600.0f, 0.0f, 50.0f);

	// Camp scenery (CC0 Poly Haven models; see ASSETS_LICENSES.md). Everything stays out of the
	// corridor from the hub to beyond the scavenging area, so the walk between them is clear.
	const TCHAR* GroundMaterialPath = TEXT("/Game/Environments/Ground/brown_mud_leaves_01/M_Ground_BrownMudLeaves.M_Ground_BrownMudLeaves");
	const TCHAR* CampFolder = TEXT("/Game/Environments/Camp");
	const FVector FirePitLocation(150.0f, 450.0f, 0.0f);
	const FVector StumpLocation(-300.0f, -350.0f, 0.0f);
	const FVector TrunkLocation(1400.0f, -650.0f, 0.0f);
	const float TrunkYaw = 25.0f;
	// Rocks come from a set of six; 0.6 scales them to boulders a person can stand beside.
	const FVector RockLocations[] = {
		FVector(2500.0f, 750.0f, 0.0f), FVector(3400.0f, -700.0f, 0.0f), FVector(3700.0f, 650.0f, 0.0f),
		FVector(2300.0f, -900.0f, 0.0f), FVector(-700.0f, 400.0f, 0.0f), FVector(1000.0f, 1100.0f, 0.0f),
	};
	const float RockScale = 0.6f;
	const int32 PlantCount = 70;
	const int32 SceneryRandomSeed = 1900;
	const FVector2D CorridorMin(-300.0f, -350.0f);
	const FVector2D CorridorMax(3800.0f, 350.0f);

	// Plants keep this far (horizontally) from the hand-placed pieces, so none grows in the fire.
	const float PlantClearance = 250.0f;

	bool IsInCorridor(const FVector& Location)
	{
		return Location.X > CorridorMin.X && Location.X < CorridorMax.X && Location.Y > CorridorMin.Y && Location.Y < CorridorMax.Y;
	}

	bool IsNearPlacedPiece(const FVector& Location)
	{
		auto IsNear = [&Location](const FVector& Piece, float Clearance)
		{
			return FVector::DistSquared2D(Location, Piece) < FMath::Square(Clearance);
		};
		bool bNear = IsNear(FirePitLocation, PlantClearance) || IsNear(StumpLocation, PlantClearance)
			// The trunk is about 4 m long.
			|| IsNear(TrunkLocation, 2.0f * PlantClearance);
		for (const FVector& Rock : RockLocations)
		{
			bNear = bNear || IsNear(Rock, PlantClearance);
		}
		return bNear;
	}

	FString CampMeshPath(const TCHAR* Model, const FString& Mesh)
	{
		return FString::Printf(TEXT("%s/%s/%s.%s"), CampFolder, Model, *Mesh, *Mesh);
	}

	int32 CountScenery(const UWorld* World)
	{
		int32 Count = 0;
		for (TActorIterator<AStaticMeshActor> It(World); It; ++It)
		{
			Count += It->ActorHasTag(ABloodRitualTestEnvironment::SceneryTag) ? 1 : 0;
		}
		return Count;
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

ABloodRitualTestEnvironment::ABloodRitualTestEnvironment()
{
	PrimaryActorTick.bCanEverTick = false;

	ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		FloorMesh = CubeFinder.Object;
	}
	ConstructorHelpers::FObjectFinder<UMaterialInterface> GroundFinder(GroundMaterialPath);
	if (GroundFinder.Succeeded())
	{
		FloorMaterial = GroundFinder.Object;
	}

	using BloodRitualPlaceholderVisuals::FindMesh;
	FirePitMesh = FindMesh(*CampMeshPath(TEXT("stone_fire_pit"), TEXT("SM_stone_fire_pit")));
	StumpMesh = FindMesh(*CampMeshPath(TEXT("tree_stump_01"), TEXT("SM_tree_stump_01")));
	TrunkMesh = FindMesh(*CampMeshPath(TEXT("dead_tree_trunk_02"), TEXT("SM_dead_tree_trunk_02")));
	for (int32 Rock = 1; Rock <= 6; ++Rock)
	{
		if (UStaticMesh* Mesh = FindMesh(*CampMeshPath(TEXT("rock_moss_set_01"), FString::Printf(TEXT("SM_rock_moss_set_01_rock%02d"), Rock))))
		{
			RockMeshes.Add(Mesh);
		}
	}
	for (const TCHAR* Plant : { TEXT("fern_02"), TEXT("shrub_02") })
	{
		for (const TCHAR* Variant : { TEXT("a"), TEXT("b"), TEXT("c"), TEXT("d") })
		{
			if (UStaticMesh* Mesh = FindMesh(*CampMeshPath(Plant, FString::Printf(TEXT("SM_%s_%s"), Plant, Variant))))
			{
				PlantMeshes.Add(Mesh);
			}
		}
	}

	DayLighting = CreateDefaultSubobject<UBloodRitualDayLightingComponent>(TEXT("DayLighting"));
}

void ABloodRitualTestEnvironment::EnsureSceneBasics()
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
	// The atmosphere goes before the sky light, so the sky light's first capture has a sky in it.
	if (!HasSkyAtmosphere())
	{
		SpawnSkyAtmosphere();
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

void ABloodRitualTestEnvironment::EnsureSlicePlaceholders()
{
	UWorld* World = GetWorld();
	if (World == nullptr)
	{
		return;
	}

	TActorIterator<ABloodRitualStockpile> StockpileIt(World);
	if (!StockpileIt)
	{
		SpawnStockpile();
	}
	TActorIterator<ABloodRitualSupplyContainer> ContainerIt(World);
	if (!ContainerIt)
	{
		SpawnScavengingContainers();
	}
	TActorIterator<ABloodRitualNoiseListenerPlaceholder> ListenerIt(World);
	if (!ListenerIt)
	{
		SpawnNoiseListener();
	}
	if (CountScenery(World) == 0)
	{
		SpawnCampScenery();
	}
}

FVector ABloodRitualTestEnvironment::GetScavengingAreaLocation()
{
	return ScavengingAreaLocation;
}

FVector ABloodRitualTestEnvironment::GetHubStockpileLocation()
{
	return HubStockpileLocation;
}

bool ABloodRitualTestEnvironment::HasFloor() const
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
	const FCollisionQueryParams Params(TEXT("BloodRitualFloorProbe"), /*bInTraceComplex*/ false);
	const FVector ProbeStart(0.0f, 0.0f, 100000.0f);
	const FVector ProbeEnd(0.0f, 0.0f, -100000.0f);
	return World->LineTraceSingleByChannel(Hit, ProbeStart, ProbeEnd, ECC_WorldStatic, Params);
}

bool ABloodRitualTestEnvironment::HasDirectionalLight() const
{
	return WorldHasComponentOfClass<UDirectionalLightComponent>(GetWorld());
}

bool ABloodRitualTestEnvironment::HasSkyAtmosphere() const
{
	return WorldHasComponentOfClass<USkyAtmosphereComponent>(GetWorld());
}

bool ABloodRitualTestEnvironment::HasSkyLight() const
{
	return WorldHasComponentOfClass<USkyLightComponent>(GetWorld());
}

bool ABloodRitualTestEnvironment::HasPlayerStart() const
{
	TActorIterator<APlayerStart> It(GetWorld());
	return static_cast<bool>(It);
}

void ABloodRitualTestEnvironment::SpawnFloor()
{
	if (FloorMesh == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: /Engine/BasicShapes/Cube not found, no floor spawned."));
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
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the floor."));
		return;
	}

	Floor->Tags.Add(FloorTag);
#if WITH_EDITOR
	Floor->SetActorLabel(TEXT("BloodRitualFloor"));
#endif

	UStaticMeshComponent* FloorComponent = Floor->GetStaticMeshComponent();
	FloorComponent->SetStaticMesh(FloorMesh);
	if (FloorMaterial != nullptr)
	{
		FloorComponent->SetMaterial(0, FloorMaterial);
	}
	FloorComponent->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	FloorComponent->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);

	Floor->FinishSpawning(FloorTransform);
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned a %.0f m x %.0f m floor."), FloorScale.X, FloorScale.Y);
}

void ABloodRitualTestEnvironment::SpawnDirectionalLight()
{
	const FTransform LightTransform(SunRotation, FVector(0.0f, 0.0f, 500.0f));
	ADirectionalLight* Sun = GetWorld()->SpawnActorDeferred<ADirectionalLight>(
		ADirectionalLight::StaticClass(), LightTransform, this, nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (Sun == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the directional light."));
		return;
	}

#if WITH_EDITOR
	Sun->SetActorLabel(TEXT("BloodRitualSun"));
#endif
	// Runtime-spawned lights cannot have baked lighting, so they must be movable.
	Sun->GetLightComponent()->SetMobility(EComponentMobility::Movable);
	// The sun lights the sky atmosphere (its direction sets the sky's colour).
	if (UDirectionalLightComponent* SunComponent = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
	{
		SunComponent->SetAtmosphereSunLight(true);
	}

	Sun->FinishSpawning(LightTransform);
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned a movable directional light."));
}

void ABloodRitualTestEnvironment::SpawnSkyLight()
{
	const FTransform LightTransform(FRotator::ZeroRotator, FVector(0.0f, 0.0f, 500.0f));
	ASkyLight* Sky = GetWorld()->SpawnActorDeferred<ASkyLight>(
		ASkyLight::StaticClass(), LightTransform, this, nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (Sky == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the sky light."));
		return;
	}

#if WITH_EDITOR
	Sky->SetActorLabel(TEXT("BloodRitualSkyLight"));
#endif
	Sky->GetLightComponent()->SetMobility(EComponentMobility::Movable);

	Sky->FinishSpawning(LightTransform);
	// One capture of the sky atmosphere (spawned just before). Real-time capture left the shadowed
	// side of skinned meshes unlit when the sky is spawned at runtime; the day clock dims the
	// captured light at dusk and night instead.
	Sky->GetLightComponent()->RecaptureSky();
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned a movable sky light."));
}

void ABloodRitualTestEnvironment::SpawnSkyAtmosphere()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	ASkyAtmosphere* Atmosphere = GetWorld()->SpawnActor<ASkyAtmosphere>(
		ASkyAtmosphere::StaticClass(), FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams);
	if (Atmosphere == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the sky atmosphere."));
		return;
	}

#if WITH_EDITOR
	Atmosphere->SetActorLabel(TEXT("BloodRitualSkyAtmosphere"));
#endif
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned a sky atmosphere."));
}

void ABloodRitualTestEnvironment::SpawnPlayerStart()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	APlayerStart* Start = GetWorld()->SpawnActor<APlayerStart>(
		APlayerStart::StaticClass(), PlayerStartLocation, FRotator::ZeroRotator, SpawnParams);
	if (Start == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the PlayerStart."));
		return;
	}

#if WITH_EDITOR
	Start->SetActorLabel(TEXT("BloodRitualPlayerStart"));
#endif
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned a PlayerStart at %s."), *PlayerStartLocation.ToString());
}

void ABloodRitualTestEnvironment::SpawnStockpile()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	ABloodRitualStockpile* Stockpile = GetWorld()->SpawnActor<ABloodRitualStockpile>(
		ABloodRitualStockpile::StaticClass(), HubStockpileLocation, FRotator::ZeroRotator, SpawnParams);
	if (Stockpile == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the stockpile."));
		return;
	}

#if WITH_EDITOR
	Stockpile->SetActorLabel(TEXT("BloodRitualStockpile"));
#endif
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned the hub stockpile at %s."), *HubStockpileLocation.ToString());
}

void ABloodRitualTestEnvironment::SpawnScavengingContainers()
{
	const TArray<FBloodRitualContainerLoot>& Loot = GetDefault<UBloodRitualSettings>()->ScavengingContainers;
	if (Loot.Num() == 0)
	{
		UE_LOG(LogBloodRitual, Warning, TEXT("BloodRitualTestEnvironment: UBloodRitualSettings::ScavengingContainers is empty, no containers spawned."));
		return;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	// A row across the scavenging area (along Y), centred on it.
	const float RowStart = -0.5f * ContainerSpacing * (Loot.Num() - 1);
	int32 Spawned = 0;
	for (int32 Index = 0; Index < Loot.Num(); ++Index)
	{
		const FVector Location = ScavengingAreaLocation + FVector(0.0f, RowStart + ContainerSpacing * Index, 0.0f);
		ABloodRitualSupplyContainer* Container = GetWorld()->SpawnActor<ABloodRitualSupplyContainer>(
			ABloodRitualSupplyContainer::StaticClass(), Location, FRotator::ZeroRotator, SpawnParams);
		if (Container == nullptr)
		{
			UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn container %d."), Index);
			continue;
		}

		Container->SetSupplies(Loot[Index].Supplies);
		Container->SetVisualVariant(Index);
#if WITH_EDITOR
		Container->SetActorLabel(FString::Printf(TEXT("BloodRitualContainer%d"), Index + 1));
#endif
		++Spawned;
	}

	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned %d scavenging containers around %s."), Spawned, *ScavengingAreaLocation.ToString());
}

void ABloodRitualTestEnvironment::SpawnNoiseListener()
{
	FActorSpawnParameters SpawnParams;
	SpawnParams.Owner = this;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	const FVector Location = ScavengingAreaLocation + NoiseListenerOffset;
	ABloodRitualNoiseListenerPlaceholder* Listener = GetWorld()->SpawnActor<ABloodRitualNoiseListenerPlaceholder>(
		ABloodRitualNoiseListenerPlaceholder::StaticClass(), Location, FRotator::ZeroRotator, SpawnParams);
	if (Listener == nullptr)
	{
		UE_LOG(LogBloodRitual, Error, TEXT("BloodRitualTestEnvironment: failed to spawn the noise listener."));
		return;
	}

#if WITH_EDITOR
	Listener->SetActorLabel(TEXT("BloodRitualNoiseListener"));
#endif
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned a placeholder noise listener at %s."), *Location.ToString());
}

void ABloodRitualTestEnvironment::SpawnCampScenery()
{
	SpawnSceneryPiece(FirePitMesh, FirePitLocation, 0.0f, 1.0f, /*bBlocks*/ true);
	SpawnSceneryPiece(StumpMesh, StumpLocation, 40.0f, 1.0f, /*bBlocks*/ true);
	SpawnSceneryPiece(TrunkMesh, TrunkLocation, TrunkYaw, 1.0f, /*bBlocks*/ true);
	for (int32 Index = 0; Index < RockMeshes.Num() && Index < static_cast<int32>(UE_ARRAY_COUNT(RockLocations)); ++Index)
	{
		SpawnSceneryPiece(RockMeshes[Index], RockLocations[Index], 60.0f * Index, RockScale, /*bBlocks*/ true);
	}

	// Ferns and shrubs in rings around the hub and the scavenging area. The fixed seed keeps the
	// layout the same every run.
	if (PlantMeshes.Num() > 0)
	{
		FRandomStream Random(SceneryRandomSeed);
		int32 Placed = 0;
		for (int32 Attempt = 0; Placed < PlantCount && Attempt < PlantCount * 10; ++Attempt)
		{
			const bool bAtHub = Random.FRand() < 0.6f;
			const FVector Centre = bAtHub ? FVector::ZeroVector : ScavengingAreaLocation;
			const float Radius = Random.FRandRange(400.0f, bAtHub ? 1800.0f : 1400.0f);
			const float Angle = Random.FRandRange(0.0f, 2.0f * PI);
			const FVector Location = Centre + FVector(Radius * FMath::Cos(Angle), Radius * FMath::Sin(Angle), 0.0f);
			if (IsInCorridor(Location) || IsNearPlacedPiece(Location))
			{
				continue;
			}
			UStaticMesh* Plant = PlantMeshes[Random.RandHelper(PlantMeshes.Num())];
			SpawnSceneryPiece(Plant, Location, Random.FRandRange(0.0f, 360.0f), Random.FRandRange(0.8f, 1.4f), /*bBlocks*/ false);
			++Placed;
		}
	}

	const int32 Spawned = CountScenery(GetWorld());
	if (Spawned == 0)
	{
		UE_LOG(LogBloodRitual, Warning, TEXT("BloodRitualTestEnvironment: no camp scenery spawned; the /Game/Environments/Camp models are missing (run git lfs pull)."));
		return;
	}
	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualTestEnvironment: spawned %d pieces of camp scenery."), Spawned);
}

void ABloodRitualTestEnvironment::SpawnSceneryPiece(UStaticMesh* Mesh, const FVector& Location, float Yaw, float Scale, bool bBlocks)
{
	if (Mesh == nullptr)
	{
		return;
	}

	// Centre the mesh's bounds on Location: pieces of a set keep their offset inside the set.
	const FRotator Rotation(0.0f, Yaw, 0.0f);
	const FVector BoundsOrigin = Mesh->GetBounds().Origin;
	const FVector Offset = Rotation.RotateVector(FVector(BoundsOrigin.X, BoundsOrigin.Y, 0.0f) * Scale);
	const FTransform Transform(Rotation, Location - Offset, FVector(Scale));

	AStaticMeshActor* Piece = GetWorld()->SpawnActorDeferred<AStaticMeshActor>(
		AStaticMeshActor::StaticClass(), Transform, this, nullptr,
		ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
	if (Piece == nullptr)
	{
		return;
	}

	Piece->Tags.Add(SceneryTag);
#if WITH_EDITOR
	Piece->SetActorLabel(FString::Printf(TEXT("BloodRitualScenery_%s"), *Mesh->GetName()));
#endif
	UStaticMeshComponent* Component = Piece->GetStaticMeshComponent();
	Component->SetStaticMesh(Mesh);
	if (bBlocks)
	{
		Component->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	}
	else
	{
		Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
	Piece->FinishSpawning(Transform);
}

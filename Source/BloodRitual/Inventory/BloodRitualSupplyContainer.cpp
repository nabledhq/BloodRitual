// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Inventory/BloodRitualSupplyContainer.h"

#include "BloodRitual.h"
#include "BloodRitualPlaceholderVisuals.h"
#include "BloodRitualSettings.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "World/BloodRitualNoiseSubsystem.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"

namespace
{
	const FLinearColor UnsearchedTint = FLinearColor::White;
	const FLinearColor SearchedTint(0.3f, 0.3f, 0.3f);

	struct FContainerLook
	{
		const TCHAR* MeshPath;
		float Scale;
	};

	// CC0 models from Poly Haven (see ASSETS_LICENSES.md), origin at the base.
	const FContainerLook ContainerLooks[] = {
		// 82 x 41 cm, 35 cm tall.
		{ TEXT("/Game/Items/Containers/wooden_crate_01/SM_wooden_crate_01.SM_wooden_crate_01"), 1.0f },
		// 74 cm across, 87 cm tall.
		{ TEXT("/Game/Items/Containers/wine_barrel_01/SM_wine_barrel_01.SM_wine_barrel_01"), 1.0f },
		// A 35 x 26 cm lidded basket, doubled so it reads as a storage basket.
		{ TEXT("/Game/Items/Containers/wicker_basket_02/SM_wicker_basket_02.SM_wicker_basket_02"), 2.0f },
	};

	// Fallback: /Engine/BasicShapes/Cube (1 m, centred) as an 80 x 80 x 60 cm crate.
	const FVector FallbackScale(0.8f, 0.8f, 0.6f);
}

ABloodRitualSupplyContainer::ABloodRitualSupplyContainer()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetMobility(EComponentMobility::Movable);
	Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Mesh->SetCanEverAffectNavigation(false);

	for (const FContainerLook& Look : ContainerLooks)
	{
		VariantMeshes.Add(BloodRitualPlaceholderVisuals::FindMesh(Look.MeshPath));
	}
	FallbackMesh = BloodRitualPlaceholderVisuals::FindMesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
	SetVisualVariant(0);
}

void ABloodRitualSupplyContainer::SetVisualVariant(int32 Variant)
{
	const int32 NumLooks = static_cast<int32>(UE_ARRAY_COUNT(ContainerLooks));
	const int32 Index = ((Variant % NumLooks) + NumLooks) % NumLooks;
	if (VariantMeshes.IsValidIndex(Index) && VariantMeshes[Index] != nullptr)
	{
		Mesh->SetStaticMesh(VariantMeshes[Index]);
		Mesh->SetRelativeScale3D(FVector(ContainerLooks[Index].Scale));
	}
	else
	{
		Mesh->SetStaticMesh(FallbackMesh);
		Mesh->SetRelativeScale3D(FallbackScale);
	}
}

void ABloodRitualSupplyContainer::BeginPlay()
{
	Super::BeginPlay();

	BloodRitualPlaceholderVisuals::SetColor(Mesh, bSearched ? SearchedTint : UnsearchedTint);
}

void ABloodRitualSupplyContainer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	AdvanceSearch(DeltaSeconds);
}

bool ABloodRitualSupplyContainer::CanInteract(AActor* Interactor) const
{
	return Interactor != nullptr && !bSearched && !bSearching;
}

void ABloodRitualSupplyContainer::Interact(AActor* Interactor)
{
	BeginSearch(Interactor);
}

FText ABloodRitualSupplyContainer::GetInteractionPrompt(AActor* Interactor) const
{
	if (bSearched)
	{
		return NSLOCTEXT("BloodRitual", "ContainerSearched", "Container (empty)");
	}
	if (bSearching)
	{
		return NSLOCTEXT("BloodRitual", "ContainerSearching", "Searching...");
	}
	return NSLOCTEXT("BloodRitual", "ContainerSearch", "Search container");
}

bool ABloodRitualSupplyContainer::BeginSearch(AActor* Searcher)
{
	if (Searcher == nullptr || bSearched || bSearching)
	{
		return false;
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();

	bSearching = true;
	CurrentSearcher = Searcher;
	SearchElapsedSeconds = 0.0f;
	SearchDurationSeconds = FMath::Max(Settings->ContainerSearchDurationSeconds, 0.0f);

	UE_LOG(LogBloodRitual, Log, TEXT("%s: %s starts searching (%.1f s)."), *GetName(), *Searcher->GetName(), SearchDurationSeconds);

	// Rummaging is audible: the first thing in the slice that lets the noise system be heard.
	if (Settings->ContainerSearchNoiseRadius > 0.0f)
	{
		if (UBloodRitualNoiseSubsystem* Noise = UBloodRitualNoiseSubsystem::Get(this))
		{
			Noise->EmitNoise(GetActorLocation(), Settings->ContainerSearchNoiseRadius, Searcher);
		}
	}

	if (SearchDurationSeconds <= 0.0f)
	{
		FinishSearch();
	}
	else
	{
		SetActorTickEnabled(true);
	}
	return true;
}

void ABloodRitualSupplyContainer::AdvanceSearch(float DeltaSeconds)
{
	if (!bSearching || DeltaSeconds <= 0.0f)
	{
		return;
	}

	SearchElapsedSeconds += DeltaSeconds;
	if (SearchElapsedSeconds >= SearchDurationSeconds)
	{
		FinishSearch();
	}
}

float ABloodRitualSupplyContainer::GetSearchProgress() const
{
	if (bSearched)
	{
		return 1.0f;
	}
	if (!bSearching || SearchDurationSeconds <= 0.0f)
	{
		return 0.0f;
	}
	return FMath::Clamp(SearchElapsedSeconds / SearchDurationSeconds, 0.0f, 1.0f);
}

void ABloodRitualSupplyContainer::FinishSearch()
{
	SetActorTickEnabled(false);
	bSearching = false;
	bSearched = true;
	SearchElapsedSeconds = SearchDurationSeconds;

	AActor* Searcher = CurrentSearcher.Get();
	CurrentSearcher = nullptr;

	UBloodRitualInventoryComponent* Inventory = Searcher != nullptr ? Searcher->FindComponentByClass<UBloodRitualInventoryComponent>() : nullptr;
	if (Inventory != nullptr)
	{
		Inventory->AddSupplies(Supplies);
		UE_LOG(LogBloodRitual, Log, TEXT("%s: search complete, %s now carries %s."), *GetName(), *Searcher->GetName(), *Inventory->GetSupplies().ToString());
	}
	else
	{
		UE_LOG(LogBloodRitual, Warning, TEXT("%s: search complete but the searcher has no UBloodRitualInventoryComponent; supplies lost."), *GetName());
	}

	BloodRitualPlaceholderVisuals::SetColor(Mesh, SearchedTint);
	OnSearched.Broadcast(this, Searcher);
}

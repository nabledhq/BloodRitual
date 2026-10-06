// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Inventory/SeminoleSupplyContainer.h"

#include "Seminole.h"
#include "SeminolePlaceholderVisuals.h"
#include "SeminoleSettings.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "World/SeminoleNoiseSubsystem.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	const FLinearColor UnsearchedColor(0.55f, 0.35f, 0.15f);
	const FLinearColor SearchedColor(0.35f, 0.35f, 0.35f);
	// /Engine/BasicShapes/Cube is 1 m; a crate 80 cm wide and 60 cm tall.
	const FVector CrateScale(0.8f, 0.8f, 0.6f);
}

ASeminoleSupplyContainer::ASeminoleSupplyContainer()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetMobility(EComponentMobility::Movable);
	Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Mesh->SetCanEverAffectNavigation(false);
	Mesh->SetRelativeScale3D(CrateScale);
	ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		Mesh->SetStaticMesh(CubeFinder.Object);
	}
}

void ASeminoleSupplyContainer::BeginPlay()
{
	Super::BeginPlay();

	SeminolePlaceholderVisuals::SetColor(Mesh, bSearched ? SearchedColor : UnsearchedColor);
}

void ASeminoleSupplyContainer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	AdvanceSearch(DeltaSeconds);
}

bool ASeminoleSupplyContainer::CanInteract(AActor* Interactor) const
{
	return Interactor != nullptr && !bSearched && !bSearching;
}

void ASeminoleSupplyContainer::Interact(AActor* Interactor)
{
	BeginSearch(Interactor);
}

FText ASeminoleSupplyContainer::GetInteractionPrompt(AActor* Interactor) const
{
	if (bSearched)
	{
		return NSLOCTEXT("Seminole", "ContainerSearched", "Container (empty)");
	}
	if (bSearching)
	{
		return NSLOCTEXT("Seminole", "ContainerSearching", "Searching...");
	}
	return NSLOCTEXT("Seminole", "ContainerSearch", "Search container");
}

bool ASeminoleSupplyContainer::BeginSearch(AActor* Searcher)
{
	if (Searcher == nullptr || bSearched || bSearching)
	{
		return false;
	}

	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();

	bSearching = true;
	CurrentSearcher = Searcher;
	SearchElapsedSeconds = 0.0f;
	SearchDurationSeconds = FMath::Max(Settings->ContainerSearchDurationSeconds, 0.0f);

	UE_LOG(LogSeminole, Log, TEXT("%s: %s starts searching (%.1f s)."), *GetName(), *Searcher->GetName(), SearchDurationSeconds);

	// Rummaging is audible: the first thing in the slice that lets the noise system be heard.
	if (Settings->ContainerSearchNoiseRadius > 0.0f)
	{
		if (USeminoleNoiseSubsystem* Noise = USeminoleNoiseSubsystem::Get(this))
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

void ASeminoleSupplyContainer::AdvanceSearch(float DeltaSeconds)
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

float ASeminoleSupplyContainer::GetSearchProgress() const
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

void ASeminoleSupplyContainer::FinishSearch()
{
	SetActorTickEnabled(false);
	bSearching = false;
	bSearched = true;
	SearchElapsedSeconds = SearchDurationSeconds;

	AActor* Searcher = CurrentSearcher.Get();
	CurrentSearcher = nullptr;

	USeminoleInventoryComponent* Inventory = Searcher != nullptr ? Searcher->FindComponentByClass<USeminoleInventoryComponent>() : nullptr;
	if (Inventory != nullptr)
	{
		Inventory->AddSupplies(Supplies);
		UE_LOG(LogSeminole, Log, TEXT("%s: search complete, %s now carries %s."), *GetName(), *Searcher->GetName(), *Inventory->GetSupplies().ToString());
	}
	else
	{
		UE_LOG(LogSeminole, Warning, TEXT("%s: search complete but the searcher has no USeminoleInventoryComponent; supplies lost."), *GetName());
	}

	SeminolePlaceholderVisuals::SetColor(Mesh, SearchedColor);
	OnSearched.Broadcast(this, Searcher);
}

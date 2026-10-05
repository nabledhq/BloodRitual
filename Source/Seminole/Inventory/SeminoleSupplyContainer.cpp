// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Inventory/SeminoleSupplyContainer.h"

#include "Seminole.h"
#include "SeminolePlaceholderVisuals.h"
#include "SeminoleSettings.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "World/SeminoleNoiseSubsystem.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"

#define LOCTEXT_NAMESPACE "SeminoleSupplyContainer"

namespace
{
	const FLinearColor UnsearchedColor(0.55f, 0.35f, 0.12f);
	const FLinearColor SearchedColor(0.12f, 0.12f, 0.12f);
}

ASeminoleSupplyContainer::ASeminoleSupplyContainer()
{
	PrimaryActorTick.bCanEverTick = true;
	// Nothing to do until a search starts; Interact() turns ticking on.
	PrimaryActorTick.bStartWithTickEnabled = false;

	// A plain scene root keeps the actor location on the floor while the mesh sits above it.
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(RootComponent);
	Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		Mesh->SetStaticMesh(CubeFinder.Object);
	}
	// A 1 m x 1 m x 0.6 m crate resting on the floor.
	Mesh->SetRelativeScale3D(FVector(1.0f, 1.0f, 0.6f));
	Mesh->SetRelativeLocation(FVector(0.0f, 0.0f, 30.0f));
}

void ASeminoleSupplyContainer::BeginPlay()
{
	Super::BeginPlay();
	SeminoleTintPlaceholderMesh(Mesh, bSearched ? SearchedColor : UnsearchedColor);
}

void ASeminoleSupplyContainer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	AdvanceSearch(DeltaSeconds);
}

bool ASeminoleSupplyContainer::CanInteract(const AActor* Interactor) const
{
	return !bSearched && !IsBeingSearched();
}

FText ASeminoleSupplyContainer::GetInteractionPrompt(const AActor* Interactor) const
{
	return LOCTEXT("SearchPrompt", "Search container");
}

void ASeminoleSupplyContainer::Interact(AActor* Interactor)
{
	if (Interactor == nullptr || !CanInteract(Interactor))
	{
		return;
	}

	Searcher = Interactor;
	SearchElapsed = 0.0f;
	SetActorTickEnabled(true);
	UE_LOG(LogSeminole, Log, TEXT("%s: %s started searching."), *GetName(), *Interactor->GetName());

	const float NoiseRadius = GetDefault<USeminoleSettings>()->ContainerSearchNoiseRadius;
	if (NoiseRadius > 0.0f)
	{
		if (USeminoleNoiseSubsystem* NoiseSubsystem = GetWorld()->GetSubsystem<USeminoleNoiseSubsystem>())
		{
			NoiseSubsystem->EmitNoise(GetActorLocation(), NoiseRadius, Interactor);
		}
	}

	// A zero duration completes immediately rather than waiting for the next tick.
	AdvanceSearch(0.0f);
}

void ASeminoleSupplyContainer::SetSupplies(const FSeminoleSupplyBundle& InSupplies)
{
	if (!bSearched)
	{
		Supplies = InSupplies;
	}
}

float ASeminoleSupplyContainer::GetSearchProgress() const
{
	if (bSearched)
	{
		return 1.0f;
	}
	if (!IsBeingSearched())
	{
		return 0.0f;
	}
	const float Duration = GetDefault<USeminoleSettings>()->ContainerSearchDurationSeconds;
	return Duration > 0.0f ? FMath::Clamp(SearchElapsed / Duration, 0.0f, 1.0f) : 1.0f;
}

void ASeminoleSupplyContainer::AdvanceSearch(float Seconds)
{
	if (bSearched)
	{
		return;
	}
	if (!Searcher.IsValid())
	{
		// The searcher was destroyed mid-search; drop the search so the container can be used again.
		Searcher.Reset();
		SearchElapsed = 0.0f;
		SetActorTickEnabled(false);
		return;
	}

	SearchElapsed += FMath::Max(Seconds, 0.0f);
	if (SearchElapsed >= GetDefault<USeminoleSettings>()->ContainerSearchDurationSeconds)
	{
		CompleteSearch();
	}
}

void ASeminoleSupplyContainer::CompleteSearch()
{
	AActor* Interactor = Searcher.Get();
	Searcher.Reset();
	SetActorTickEnabled(false);
	bSearched = true;
	SeminoleTintPlaceholderMesh(Mesh, SearchedColor);

	USeminoleInventoryComponent* Inventory = Interactor ? Interactor->FindComponentByClass<USeminoleInventoryComponent>() : nullptr;
	if (Inventory == nullptr)
	{
		UE_LOG(LogSeminole, Warning, TEXT("%s: searcher has no USeminoleInventoryComponent; %s was lost."), *GetName(), *Supplies.ToString());
		return;
	}

	Inventory->AddBundle(Supplies);
	UE_LOG(LogSeminole, Log, TEXT("%s: %s found %s."), *GetName(), *Interactor->GetName(), *Supplies.ToString());
}

#undef LOCTEXT_NAMESPACE

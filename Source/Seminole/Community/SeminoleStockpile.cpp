// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Community/SeminoleStockpile.h"

#include "Seminole.h"
#include "SeminoleGameState.h"
#include "SeminolePlaceholderVisuals.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "UObject/ConstructorHelpers.h"

#define LOCTEXT_NAMESPACE "SeminoleStockpile"

ASeminoleStockpile::ASeminoleStockpile()
{
	PrimaryActorTick.bCanEverTick = false;

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
	// A 1.5 m x 1.5 m x 2 m block standing on the floor.
	Mesh->SetRelativeScale3D(FVector(1.5f, 1.5f, 2.0f));
	Mesh->SetRelativeLocation(FVector(0.0f, 0.0f, 100.0f));
}

void ASeminoleStockpile::BeginPlay()
{
	Super::BeginPlay();
	SeminoleTintPlaceholderMesh(Mesh, FLinearColor(0.9f, 0.7f, 0.1f));
}

bool ASeminoleStockpile::CanInteract(const AActor* Interactor) const
{
	const USeminoleInventoryComponent* Inventory = Interactor ? Interactor->FindComponentByClass<USeminoleInventoryComponent>() : nullptr;
	return Inventory != nullptr && !Inventory->IsEmpty();
}

FText ASeminoleStockpile::GetInteractionPrompt(const AActor* Interactor) const
{
	return LOCTEXT("DepositPrompt", "Deposit supplies");
}

void ASeminoleStockpile::Interact(AActor* Interactor)
{
	USeminoleInventoryComponent* Inventory = Interactor ? Interactor->FindComponentByClass<USeminoleInventoryComponent>() : nullptr;
	if (Inventory == nullptr || Inventory->IsEmpty())
	{
		return;
	}

	ASeminoleGameState* GameState = GetWorld()->GetGameState<ASeminoleGameState>();
	if (GameState == nullptr)
	{
		UE_LOG(LogSeminole, Error, TEXT("%s: no ASeminoleGameState in the world; nothing deposited. Is the game mode ASeminoleGameMode?"), *GetName());
		return;
	}

	GameState->DepositSupplies(Inventory->TakeAll());
}

#undef LOCTEXT_NAMESPACE

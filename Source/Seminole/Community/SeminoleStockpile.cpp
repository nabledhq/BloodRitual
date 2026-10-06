// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Community/SeminoleStockpile.h"

#include "Seminole.h"
#include "SeminolePlaceholderVisuals.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	const FLinearColor StockpileColor(0.15f, 0.6f, 0.25f);
	// /Engine/BasicShapes/Cube is 1 m; a 1.5 m square, 1 m tall store.
	const FVector StockpileScale(1.5f, 1.5f, 1.0f);
}

ASeminoleStockpile::ASeminoleStockpile()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetMobility(EComponentMobility::Movable);
	Mesh->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
	Mesh->SetCanEverAffectNavigation(false);
	Mesh->SetRelativeScale3D(StockpileScale);
	ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		Mesh->SetStaticMesh(CubeFinder.Object);
	}
}

void ASeminoleStockpile::BeginPlay()
{
	Super::BeginPlay();

	SeminolePlaceholderVisuals::SetColor(Mesh, StockpileColor);
}

bool ASeminoleStockpile::CanInteract(AActor* Interactor) const
{
	const USeminoleInventoryComponent* Inventory = Interactor != nullptr ? Interactor->FindComponentByClass<USeminoleInventoryComponent>() : nullptr;
	return Inventory != nullptr && !Inventory->IsEmpty();
}

void ASeminoleStockpile::Interact(AActor* Interactor)
{
	DepositAll(Interactor != nullptr ? Interactor->FindComponentByClass<USeminoleInventoryComponent>() : nullptr);
}

FText ASeminoleStockpile::GetInteractionPrompt(AActor* Interactor) const
{
	if (CanInteract(Interactor))
	{
		return NSLOCTEXT("Seminole", "StockpileDeposit", "Deposit supplies");
	}
	return NSLOCTEXT("Seminole", "StockpileNothing", "Stockpile (nothing to deposit)");
}

FSeminoleSupplyCounts ASeminoleStockpile::DepositAll(USeminoleInventoryComponent* From)
{
	if (From == nullptr)
	{
		return FSeminoleSupplyCounts();
	}

	const FSeminoleSupplyCounts Deposited = From->TakeAll();
	if (!Deposited.IsEmpty())
	{
		Supplies.Add(Deposited);
		UE_LOG(LogSeminole, Log, TEXT("%s: deposited %s; stockpile now %s."), *GetName(), *Deposited.ToString(), *Supplies.ToString());
		OnStockpileChanged.Broadcast();
	}
	return Deposited;
}

void ASeminoleStockpile::AddSupply(ESeminoleSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return;
	}
	Supplies.Add(Type, Amount);
	OnStockpileChanged.Broadcast();
}

bool ASeminoleStockpile::TrySpend(ESeminoleSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return true;
	}
	if (Supplies.Get(Type) < Amount)
	{
		return false;
	}
	Supplies.Add(Type, -Amount);
	UE_LOG(LogSeminole, Log, TEXT("%s: spent %d %s; stockpile now %s."), *GetName(), Amount, *SeminoleSupplyTypeToString(Type), *Supplies.ToString());
	OnStockpileChanged.Broadcast();
	return true;
}

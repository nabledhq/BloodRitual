// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Community/BloodRitualStockpile.h"

#include "BloodRitual.h"
#include "BloodRitualPlaceholderVisuals.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Engine/StaticMesh.h"

namespace
{
	// CC0 models from Poly Haven (see ASSETS_LICENSES.md), origin at the base.
	const TCHAR* MainCratePath = TEXT("/Game/Items/Containers/wooden_crate_02/SM_wooden_crate_02.SM_wooden_crate_02");
	const TCHAR* BarrelPath = TEXT("/Game/Items/Containers/wine_barrel_01/SM_wine_barrel_01.SM_wine_barrel_01");
	const TCHAR* TopCratePath = TEXT("/Game/Items/Containers/wooden_crate_01/SM_wooden_crate_01.SM_wooden_crate_01");

	// The main crate is 52 x 116 cm (long side along Y) and 45 cm tall: the barrel stands at its
	// -Y end and the 82 x 41 cm crate lies across its lid.
	const FVector BarrelOffset(0.0f, -100.0f, 0.0f);
	const FVector TopCrateOffset(0.0f, 15.0f, 45.0f);
	const FRotator TopCrateRotation(0.0f, 90.0f, 0.0f);

	// Fallback: /Engine/BasicShapes/Cube (1 m, centred) as a 1.5 m square, 1 m tall green block.
	const FLinearColor FallbackColor(0.15f, 0.6f, 0.25f);
	const FVector FallbackScale(1.5f, 1.5f, 1.0f);

	UStaticMeshComponent* CreateStoreMesh(AActor* Owner, const FName Name)
	{
		UStaticMeshComponent* Component = Owner->CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Component->SetMobility(EComponentMobility::Movable);
		Component->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
		Component->SetCanEverAffectNavigation(false);
		return Component;
	}
}

ABloodRitualStockpile::ABloodRitualStockpile()
{
	PrimaryActorTick.bCanEverTick = false;

	Mesh = CreateStoreMesh(this, TEXT("Mesh"));
	SetRootComponent(Mesh);
	Barrel = CreateStoreMesh(this, TEXT("Barrel"));
	Barrel->SetupAttachment(Mesh);
	Barrel->SetRelativeLocation(BarrelOffset);
	TopCrate = CreateStoreMesh(this, TEXT("TopCrate"));
	TopCrate->SetupAttachment(Mesh);
	TopCrate->SetRelativeLocationAndRotation(TopCrateOffset, TopCrateRotation);

	UStaticMesh* MainCrate = BloodRitualPlaceholderVisuals::FindMesh(MainCratePath);
	if (MainCrate != nullptr)
	{
		Mesh->SetStaticMesh(MainCrate);
		Barrel->SetStaticMesh(BloodRitualPlaceholderVisuals::FindMesh(BarrelPath));
		TopCrate->SetStaticMesh(BloodRitualPlaceholderVisuals::FindMesh(TopCratePath));
	}
	else
	{
		bUsingFallbackMesh = true;
		Mesh->SetStaticMesh(BloodRitualPlaceholderVisuals::FindMesh(TEXT("/Engine/BasicShapes/Cube.Cube")));
		Mesh->SetRelativeScale3D(FallbackScale);
	}
}

void ABloodRitualStockpile::BeginPlay()
{
	Super::BeginPlay();

	if (bUsingFallbackMesh)
	{
		BloodRitualPlaceholderVisuals::SetColor(Mesh, FallbackColor);
	}
}

bool ABloodRitualStockpile::CanInteract(AActor* Interactor) const
{
	const UBloodRitualInventoryComponent* Inventory = Interactor != nullptr ? Interactor->FindComponentByClass<UBloodRitualInventoryComponent>() : nullptr;
	return Inventory != nullptr && !Inventory->IsEmpty();
}

void ABloodRitualStockpile::Interact(AActor* Interactor)
{
	DepositAll(Interactor != nullptr ? Interactor->FindComponentByClass<UBloodRitualInventoryComponent>() : nullptr);
}

FText ABloodRitualStockpile::GetInteractionPrompt(AActor* Interactor) const
{
	if (CanInteract(Interactor))
	{
		return NSLOCTEXT("BloodRitual", "StockpileDeposit", "Deposit supplies");
	}
	return NSLOCTEXT("BloodRitual", "StockpileNothing", "Stockpile (nothing to deposit)");
}

FBloodRitualSupplyCounts ABloodRitualStockpile::DepositAll(UBloodRitualInventoryComponent* From)
{
	if (From == nullptr)
	{
		return FBloodRitualSupplyCounts();
	}

	const FBloodRitualSupplyCounts Deposited = From->TakeAll();
	if (!Deposited.IsEmpty())
	{
		Supplies.Add(Deposited);
		UE_LOG(LogBloodRitual, Log, TEXT("%s: deposited %s; stockpile now %s."), *GetName(), *Deposited.ToString(), *Supplies.ToString());
		OnStockpileChanged.Broadcast();
	}
	return Deposited;
}

void ABloodRitualStockpile::AddSupply(EBloodRitualSupplyType Type, int32 Amount)
{
	if (Amount <= 0)
	{
		return;
	}
	Supplies.Add(Type, Amount);
	OnStockpileChanged.Broadcast();
}

bool ABloodRitualStockpile::TrySpend(EBloodRitualSupplyType Type, int32 Amount)
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
	UE_LOG(LogBloodRitual, Log, TEXT("%s: spent %d %s; stockpile now %s."), *GetName(), Amount, *BloodRitualSupplyTypeToString(Type), *Supplies.ToString());
	OnStockpileChanged.Broadcast();
	return true;
}

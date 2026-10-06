// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "SeminoleSettings.h"
#include "Community/SeminoleStockpile.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "Inventory/SeminoleSupplyContainer.h"
#include "Tests/SeminoleTestWorld.h"
#include "GameFramework/Actor.h"

namespace
{
	/** A bare actor carrying an inventory component, standing in for the player pawn. */
	AActor* SpawnCarrier(const FSeminoleTestWorld& TestWorld)
	{
		AActor* Carrier = TestWorld.SpawnActor<AActor>();
		if (Carrier != nullptr)
		{
			USeminoleInventoryComponent* Inventory = NewObject<USeminoleInventoryComponent>(Carrier);
			Inventory->RegisterComponent();
		}
		return Carrier;
	}
}

/**
 * Loot flow: a container search grants its supplies once the configured duration has
 * elapsed, a second search grants nothing, depositing moves everything into the stockpile
 * and empties the inventory, and TrySpend succeeds only when the stockpile holds enough.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleLootFlowTest, "Seminole.Inventory.LootFlow",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FSeminoleLootFlowTest::RunTest(const FString& Parameters)
{
	FSeminoleTestWorld TestWorld;
	if (!TestNotNull(TEXT("Test world"), TestWorld.GetWorld()))
	{
		return false;
	}

	const float SearchDuration = GetDefault<USeminoleSettings>()->ContainerSearchDurationSeconds;

	AActor* Carrier = SpawnCarrier(TestWorld);
	ASeminoleSupplyContainer* Container = TestWorld.SpawnActor<ASeminoleSupplyContainer>(FVector(100.0f, 0.0f, 30.0f));
	ASeminoleStockpile* Stockpile = TestWorld.SpawnActor<ASeminoleStockpile>(FVector(-100.0f, 0.0f, 50.0f));
	if (!TestNotNull(TEXT("Carrier"), Carrier) || !TestNotNull(TEXT("Container"), Container) || !TestNotNull(TEXT("Stockpile"), Stockpile))
	{
		return false;
	}

	USeminoleInventoryComponent* Inventory = Carrier->FindComponentByClass<USeminoleInventoryComponent>();
	if (!TestNotNull(TEXT("Carrier inventory"), Inventory))
	{
		return false;
	}

	TArray<FSeminoleSupplyAmount> Loot;
	Loot.Add(FSeminoleSupplyAmount(ESeminoleSupplyType::Food, 3));
	Loot.Add(FSeminoleSupplyAmount(ESeminoleSupplyType::Materials, 5));
	Container->SetSupplies(Loot);

	// --- Container search grants supplies after the configured duration ---
	TestTrue(TEXT("Unsearched container can be interacted with"), Container->CanInteract(Carrier));
	TestTrue(TEXT("Search starts"), Container->BeginSearch(Carrier));
	TestTrue(TEXT("Container is being searched"), Container->IsBeingSearched());
	TestFalse(TEXT("Container is not yet searched"), Container->IsSearched());
	TestFalse(TEXT("A search in progress blocks a second one"), Container->CanInteract(Carrier));
	TestEqual(TEXT("Nothing granted while searching"), Inventory->GetTotalSupplyCount(), 0);

	if (SearchDuration > 0.0f)
	{
		Container->AdvanceSearch(SearchDuration * 0.5f);
		TestFalse(TEXT("Not searched halfway through"), Container->IsSearched());
		TestEqual(TEXT("Progress is 0.5 halfway through"), Container->GetSearchProgress(), 0.5f);
		TestEqual(TEXT("Nothing granted halfway through"), Inventory->GetTotalSupplyCount(), 0);
		Container->AdvanceSearch(SearchDuration * 0.5f);
	}

	TestTrue(TEXT("Searched after the configured duration"), Container->IsSearched());
	TestFalse(TEXT("No longer being searched"), Container->IsBeingSearched());
	TestEqual(TEXT("Food granted"), Inventory->GetSupplyCount(ESeminoleSupplyType::Food), 3);
	TestEqual(TEXT("Materials granted"), Inventory->GetSupplyCount(ESeminoleSupplyType::Materials), 5);
	TestEqual(TEXT("No ammo granted"), Inventory->GetSupplyCount(ESeminoleSupplyType::Ammo), 0);
	TestEqual(TEXT("Total carried"), Inventory->GetTotalSupplyCount(), 8);

	// --- A second search grants nothing ---
	TestFalse(TEXT("Searched container cannot be interacted with"), Container->CanInteract(Carrier));
	TestFalse(TEXT("Second search is refused"), Container->BeginSearch(Carrier));
	Container->AdvanceSearch(SearchDuration + 1.0f);
	TestEqual(TEXT("Second search granted nothing"), Inventory->GetTotalSupplyCount(), 8);

	// --- Inventory remove ---
	TestFalse(TEXT("Removing more than carried fails"), Inventory->RemoveSupply(ESeminoleSupplyType::Food, 4));
	TestEqual(TEXT("Failed removal changes nothing"), Inventory->GetSupplyCount(ESeminoleSupplyType::Food), 3);
	TestTrue(TEXT("Removing one food succeeds"), Inventory->RemoveSupply(ESeminoleSupplyType::Food, 1));
	TestEqual(TEXT("Two food left"), Inventory->GetSupplyCount(ESeminoleSupplyType::Food), 2);
	Inventory->AddSupply(ESeminoleSupplyType::Food, 1);
	TestEqual(TEXT("Three food again"), Inventory->GetSupplyCount(ESeminoleSupplyType::Food), 3);

	// --- Deposit moves everything into the stockpile ---
	TestTrue(TEXT("Stockpile accepts a carrier with supplies"), Stockpile->CanInteract(Carrier));
	Stockpile->Interact(Carrier);
	TestEqual(TEXT("Inventory is empty after deposit"), Inventory->GetTotalSupplyCount(), 0);
	TestTrue(TEXT("Inventory reports empty"), Inventory->IsEmpty());
	TestEqual(TEXT("Stockpile food"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Food), 3);
	TestEqual(TEXT("Stockpile materials"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Materials), 5);
	TestEqual(TEXT("Stockpile ammo"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Ammo), 0);
	TestFalse(TEXT("Stockpile refuses an empty carrier"), Stockpile->CanInteract(Carrier));

	// Depositing an empty inventory changes nothing.
	const FSeminoleSupplyCounts Nothing = Stockpile->DepositAll(Inventory);
	TestTrue(TEXT("Empty deposit moves nothing"), Nothing.IsEmpty());
	TestEqual(TEXT("Stockpile unchanged by empty deposit"), Stockpile->GetSupplies().Total(), 8);

	// --- TrySpend ---
	TestFalse(TEXT("Spending more materials than stored fails"), Stockpile->TrySpend(ESeminoleSupplyType::Materials, 6));
	TestEqual(TEXT("Failed spend changes nothing"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Materials), 5);
	TestFalse(TEXT("Spending a type the stockpile lacks fails"), Stockpile->TrySpend(ESeminoleSupplyType::Ammo, 1));
	TestTrue(TEXT("Spending within the total succeeds"), Stockpile->TrySpend(ESeminoleSupplyType::Materials, 4));
	TestEqual(TEXT("Materials reduced"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Materials), 1);
	TestTrue(TEXT("Spending exactly the remainder succeeds"), Stockpile->TrySpend(ESeminoleSupplyType::Materials, 1));
	TestEqual(TEXT("Materials exhausted"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Materials), 0);
	TestFalse(TEXT("Spending from an exhausted type fails"), Stockpile->TrySpend(ESeminoleSupplyType::Materials, 1));
	TestEqual(TEXT("Food untouched by material spending"), Stockpile->GetSupplyCount(ESeminoleSupplyType::Food), 3);

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS

// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "SeminoleGameState.h"
#include "SeminolePlaceholderCharacter.h"
#include "SeminoleSettings.h"
#include "Community/SeminoleStockpile.h"
#include "Interaction/SeminoleInteractionComponent.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "Inventory/SeminoleSupplyContainer.h"
#include "Survival/SeminoleDayClockSubsystem.h"
#include "World/SeminoleNoiseListenerPlaceholder.h"
#include "World/SeminoleNoiseSubsystem.h"
#include "Engine/Engine.h"
#include "Engine/World.h"

namespace
{
	/**
	 * A bare game world for one test, torn down when it goes out of scope. The same pattern
	 * the engine's own TimerManager and GameplayAbilities tests use: no map, no game mode,
	 * so the tests put actors and the GameState in place themselves.
	 */
	struct FSeminoleTestWorld
	{
		UWorld* World = nullptr;

		FSeminoleTestWorld()
		{
			World = UWorld::CreateWorld(EWorldType::Game, false);
			FWorldContext& WorldContext = GEngine->CreateNewWorldContext(EWorldType::Game);
			WorldContext.SetCurrentWorld(World);
			World->InitializeActorsForPlay(FURL());
			World->BeginPlay();
		}

		~FSeminoleTestWorld()
		{
			GEngine->DestroyWorldContext(World);
			World->DestroyWorld(false);
		}

		template <typename TActor>
		TActor* Spawn(const FVector& Location)
		{
			FActorSpawnParameters SpawnParams;
			SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			return World->SpawnActor<TActor>(TActor::StaticClass(), Location, FRotator::ZeroRotator, SpawnParams);
		}
	};
}

// Context and filter flags spelled out per test: these members exist in every UE5 version of EAutomationTestFlags.
#define SEMINOLE_TEST_FLAGS (EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::ProductFilter)

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleNoiseFilteringTest, "Seminole.VerticalSlice.Noise.ListenersInsideRadiusHear", SEMINOLE_TEST_FLAGS)

bool FSeminoleNoiseFilteringTest::RunTest(const FString& Parameters)
{
	FSeminoleTestWorld TestWorld;
	UWorld* World = TestWorld.World;

	USeminoleNoiseSubsystem* Noise = World->GetSubsystem<USeminoleNoiseSubsystem>();
	if (!TestNotNull(TEXT("Noise subsystem exists"), Noise))
	{
		return false;
	}

	// The far listener is offset vertically so the test proves the distance check is 3D.
	ASeminoleNoiseListenerPlaceholder* NearListener = TestWorld.Spawn<ASeminoleNoiseListenerPlaceholder>(FVector(300.0f, 0.0f, 0.0f));
	ASeminoleNoiseListenerPlaceholder* FarListener = TestWorld.Spawn<ASeminoleNoiseListenerPlaceholder>(FVector(0.0f, 0.0f, 600.0f));
	AActor* Instigator = TestWorld.Spawn<AActor>(FVector::ZeroVector);
	if (!TestNotNull(TEXT("Near listener spawned"), NearListener) || !TestNotNull(TEXT("Far listener spawned"), FarListener))
	{
		return false;
	}

	// BeginPlay registers the listeners when it runs; registering again must be harmless.
	Noise->RegisterListener(NearListener);
	Noise->RegisterListener(FarListener);
	TestEqual(TEXT("Two listeners registered"), Noise->GetListenerCount(), 2);
	TestTrue(TEXT("Near listener is registered"), Noise->IsListenerRegistered(NearListener));

	const float Radius = 500.0f;
	const int32 Heard = Noise->EmitNoise(FVector::ZeroVector, Radius, Instigator);

	TestEqual(TEXT("Exactly one listener heard the noise"), Heard, 1);
	TestEqual(TEXT("Listener inside the radius heard it"), NearListener->GetHeardNoiseCount(), 1);
	TestEqual(TEXT("Listener outside the radius did not"), FarListener->GetHeardNoiseCount(), 0);

	const FSeminoleNoiseEvent& Event = NearListener->GetLastHeardNoise();
	TestTrue(TEXT("Event carries the location"), Event.Location.Equals(FVector::ZeroVector));
	TestEqual(TEXT("Event carries the radius"), Event.Radius, Radius);
	TestTrue(TEXT("Event carries the instigator"), Event.Instigator == Instigator);

	// A noise on the boundary is heard (<= radius); one just short of it is not.
	TestEqual(TEXT("Noise reaching exactly the listener distance is heard"), Noise->EmitNoise(FVector::ZeroVector, 300.0f, nullptr), 1);
	TestEqual(TEXT("Noise just short of the listener is not heard"), Noise->EmitNoise(FVector::ZeroVector, 299.0f, nullptr), 0);

	// Unregistered listeners hear nothing even inside the radius.
	Noise->UnregisterListener(NearListener);
	TestFalse(TEXT("Near listener is no longer registered"), Noise->IsListenerRegistered(NearListener));
	TestEqual(TEXT("Nobody hears after unregistering"), Noise->EmitNoise(FVector::ZeroVector, Radius, nullptr), 0);
	TestEqual(TEXT("Unregistered listener count unchanged"), NearListener->GetHeardNoiseCount(), 2);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleDayClockTransitionsTest, "Seminole.VerticalSlice.DayClock.TransitionsInOrderAndResets", SEMINOLE_TEST_FLAGS)

bool FSeminoleDayClockTransitionsTest::RunTest(const FString& Parameters)
{
	FSeminoleTestWorld TestWorld;
	UWorld* World = TestWorld.World;

	USeminoleDayClockSubsystem* Clock = World->GetSubsystem<USeminoleDayClockSubsystem>();
	if (!TestNotNull(TEXT("Day clock subsystem exists"), Clock))
	{
		return false;
	}

	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	const float DayDuration = Settings->DayDurationSeconds;
	const float DuskDuration = Settings->DuskDurationSeconds;
	const float Tolerance = 0.01f;

	TArray<ESeminoleDayPhase> Broadcasts;
	const FDelegateHandle Handle = Clock->OnPhaseChanged.AddLambda([&Broadcasts](ESeminoleDayPhase NewPhase)
	{
		Broadcasts.Add(NewPhase);
	});

	// Starts in Day with the full duration, without anyone calling ResetToDay().
	TestTrue(TEXT("Starts in Day"), Clock->GetPhase() == ESeminoleDayPhase::Day);
	TestEqual(TEXT("Starts with the full Day duration"), Clock->GetTimeRemainingInPhase(), DayDuration, Tolerance);
	TestEqual(TEXT("Day duration comes from settings"), Clock->GetPhaseDuration(ESeminoleDayPhase::Day), DayDuration, Tolerance);
	TestEqual(TEXT("Dusk duration comes from settings"), Clock->GetPhaseDuration(ESeminoleDayPhase::Dusk), DuskDuration, Tolerance);

	// Day -> Dusk at exactly the Day duration.
	Clock->AdvanceTime(DayDuration - 1.0f);
	TestTrue(TEXT("Still Day one second before the boundary"), Clock->GetPhase() == ESeminoleDayPhase::Day);
	TestEqual(TEXT("One second of Day remains"), Clock->GetTimeRemainingInPhase(), 1.0f, Tolerance);
	TestEqual(TEXT("No broadcast before the boundary"), Broadcasts.Num(), 0);

	Clock->AdvanceTime(1.0f);
	TestTrue(TEXT("Dusk after the Day duration"), Clock->GetPhase() == ESeminoleDayPhase::Dusk);
	TestEqual(TEXT("Dusk starts with the full Dusk duration"), Clock->GetTimeRemainingInPhase(), DuskDuration, Tolerance);
	TestEqual(TEXT("One broadcast so far"), Broadcasts.Num(), 1);
	TestTrue(TEXT("First broadcast is Dusk"), Broadcasts.Num() >= 1 && Broadcasts[0] == ESeminoleDayPhase::Dusk);

	// Dusk -> Night at exactly the Dusk duration.
	Clock->AdvanceTime(DuskDuration * 0.5f);
	TestTrue(TEXT("Still Dusk halfway through"), Clock->GetPhase() == ESeminoleDayPhase::Dusk);
	TestEqual(TEXT("Half of Dusk remains"), Clock->GetTimeRemainingInPhase(), DuskDuration * 0.5f, Tolerance);
	TestEqual(TEXT("Halfway progress"), Clock->GetPhaseProgress(), 0.5f, Tolerance);

	Clock->AdvanceTime(DuskDuration * 0.5f);
	TestTrue(TEXT("Night after the Dusk duration"), Clock->GetPhase() == ESeminoleDayPhase::Night);
	TestEqual(TEXT("Night has no time remaining"), Clock->GetTimeRemainingInPhase(), 0.0f, Tolerance);
	TestEqual(TEXT("Two broadcasts so far"), Broadcasts.Num(), 2);
	TestTrue(TEXT("Second broadcast is Night"), Broadcasts.Num() >= 2 && Broadcasts[1] == ESeminoleDayPhase::Night);

	// Night does not end on its own.
	Clock->AdvanceTime(DayDuration * 10.0f);
	TestTrue(TEXT("Stays Night"), Clock->GetPhase() == ESeminoleDayPhase::Night);
	TestEqual(TEXT("No broadcast while Night continues"), Broadcasts.Num(), 2);

	// Reset returns to Day with the full duration and broadcasts it.
	Clock->ResetToDay();
	TestTrue(TEXT("Reset returns to Day"), Clock->GetPhase() == ESeminoleDayPhase::Day);
	TestEqual(TEXT("Reset restores the full Day duration"), Clock->GetTimeRemainingInPhase(), DayDuration, Tolerance);
	TestEqual(TEXT("Reset broadcast"), Broadcasts.Num(), 3);
	TestTrue(TEXT("Third broadcast is Day"), Broadcasts.Num() >= 3 && Broadcasts[2] == ESeminoleDayPhase::Day);

	// One large step crosses both boundaries and still fires Dusk then Night, in order.
	Clock->AdvanceTime(DayDuration + DuskDuration + 1.0f);
	TestTrue(TEXT("Large step ends in Night"), Clock->GetPhase() == ESeminoleDayPhase::Night);
	TestEqual(TEXT("Large step broadcast both transitions"), Broadcasts.Num(), 5);
	TestTrue(TEXT("Large step broadcast Dusk then Night"),
		Broadcasts.Num() >= 5 && Broadcasts[3] == ESeminoleDayPhase::Dusk && Broadcasts[4] == ESeminoleDayPhase::Night);

	Clock->OnPhaseChanged.Remove(Handle);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FSeminoleLootFlowTest, "Seminole.VerticalSlice.Loot.SearchDepositAndSpend", SEMINOLE_TEST_FLAGS)

bool FSeminoleLootFlowTest::RunTest(const FString& Parameters)
{
	FSeminoleTestWorld TestWorld;
	UWorld* World = TestWorld.World;

	ASeminoleGameState* GameState = TestWorld.Spawn<ASeminoleGameState>(FVector::ZeroVector);
	if (!TestNotNull(TEXT("GameState spawned"), GameState))
	{
		return false;
	}
	World->SetGameState(GameState);

	ASeminolePlaceholderCharacter* Player = TestWorld.Spawn<ASeminolePlaceholderCharacter>(FVector(0.0f, 0.0f, 100.0f));
	if (!TestNotNull(TEXT("Player spawned"), Player))
	{
		return false;
	}
	USeminoleInventoryComponent* Inventory = Player->GetInventory();
	USeminoleInteractionComponent* Interaction = Player->GetInteraction();
	if (!TestNotNull(TEXT("Player has an inventory"), Inventory) || !TestNotNull(TEXT("Player has an interaction component"), Interaction))
	{
		return false;
	}
	TestTrue(TEXT("Inventory starts empty"), Inventory->IsEmpty());

	const float SearchDuration = GetDefault<USeminoleSettings>()->ContainerSearchDurationSeconds;
	const FSeminoleSupplyBundle Loot(3, 2, 1);

	// Container within interaction range of the player.
	ASeminoleSupplyContainer* Container = TestWorld.Spawn<ASeminoleSupplyContainer>(FVector(100.0f, 0.0f, 0.0f));
	if (!TestNotNull(TEXT("Container spawned"), Container))
	{
		return false;
	}
	Container->SetSupplies(Loot);

	// Search through the interaction component, as the Interact key would.
	TestTrue(TEXT("Container is the focused interactable"), Interaction->FindFocusedInteractable() == Container);
	TestTrue(TEXT("Interact starts the search"), Interaction->TryInteract());
	if (SearchDuration > 0.0f)
	{
		TestTrue(TEXT("Search is running"), Container->IsBeingSearched());
		TestFalse(TEXT("Nothing granted before the search completes"), Container->IsSearched());
		TestTrue(TEXT("Inventory still empty mid-search"), Inventory->IsEmpty());
		TestFalse(TEXT("A running search cannot be started again"), Container->CanInteract(Player));

		Container->AdvanceSearch(SearchDuration * 0.5f);
		TestEqual(TEXT("Search progress halfway"), Container->GetSearchProgress(), 0.5f, 0.01f);
		TestTrue(TEXT("Inventory still empty at half time"), Inventory->IsEmpty());

		Container->AdvanceSearch(SearchDuration * 0.5f);
	}

	TestTrue(TEXT("Container is searched after the configured duration"), Container->IsSearched());
	TestFalse(TEXT("Search no longer running"), Container->IsBeingSearched());
	TestEqual(TEXT("Food granted"), Inventory->GetSupplyCount(ESeminoleSupplyType::Food), Loot.Food);
	TestEqual(TEXT("Ammo granted"), Inventory->GetSupplyCount(ESeminoleSupplyType::Ammo), Loot.Ammo);
	TestEqual(TEXT("Materials granted"), Inventory->GetSupplyCount(ESeminoleSupplyType::Materials), Loot.Materials);

	// A second search grants nothing.
	TestFalse(TEXT("Searched container refuses interaction"), Container->CanInteract(Player));
	TestNull(TEXT("Searched container is no longer focused"), Interaction->FindFocusedInteractable());
	Container->Interact(Player);
	Container->AdvanceSearch(SearchDuration + 1.0f);
	TestEqual(TEXT("Second search grants no Food"), Inventory->GetSupplyCount(ESeminoleSupplyType::Food), Loot.Food);
	TestEqual(TEXT("Second search grants no Ammo"), Inventory->GetSupplyCount(ESeminoleSupplyType::Ammo), Loot.Ammo);
	TestEqual(TEXT("Second search grants no Materials"), Inventory->GetSupplyCount(ESeminoleSupplyType::Materials), Loot.Materials);

	// Deposit at the stockpile moves everything into the GameState and empties the inventory.
	ASeminoleStockpile* Stockpile = TestWorld.Spawn<ASeminoleStockpile>(FVector(-100.0f, 0.0f, 0.0f));
	if (!TestNotNull(TEXT("Stockpile spawned"), Stockpile))
	{
		return false;
	}
	TestTrue(TEXT("Stockpile accepts a carrying player"), Stockpile->CanInteract(Player));
	TestTrue(TEXT("Stockpile is the focused interactable"), Interaction->FindFocusedInteractable() == Stockpile);
	TestTrue(TEXT("Interact deposits"), Interaction->TryInteract());

	TestTrue(TEXT("Inventory empty after deposit"), Inventory->IsEmpty());
	TestEqual(TEXT("Stockpile Food"), GameState->GetStockpileCount(ESeminoleSupplyType::Food), Loot.Food);
	TestEqual(TEXT("Stockpile Ammo"), GameState->GetStockpileCount(ESeminoleSupplyType::Ammo), Loot.Ammo);
	TestEqual(TEXT("Stockpile Materials"), GameState->GetStockpileCount(ESeminoleSupplyType::Materials), Loot.Materials);
	TestFalse(TEXT("Stockpile refuses an empty-handed player"), Stockpile->CanInteract(Player));

	// TrySpend succeeds within the totals and fails, unchanged, beyond them.
	TestTrue(TEXT("Spend 1 Materials succeeds"), GameState->TrySpend(ESeminoleSupplyType::Materials, 1));
	TestEqual(TEXT("Materials spent"), GameState->GetStockpileCount(ESeminoleSupplyType::Materials), 0);
	TestFalse(TEXT("Spend from an empty type fails"), GameState->TrySpend(ESeminoleSupplyType::Materials, 1));
	TestEqual(TEXT("Failed spend leaves Materials unchanged"), GameState->GetStockpileCount(ESeminoleSupplyType::Materials), 0);
	TestFalse(TEXT("Spend beyond the total fails"), GameState->TrySpend(ESeminoleSupplyType::Food, Loot.Food + 1));
	TestEqual(TEXT("Failed spend leaves Food unchanged"), GameState->GetStockpileCount(ESeminoleSupplyType::Food), Loot.Food);
	TestTrue(TEXT("Spend the exact total succeeds"), GameState->TrySpend(ESeminoleSupplyType::Food, Loot.Food));
	TestEqual(TEXT("Food spent to zero"), GameState->GetStockpileCount(ESeminoleSupplyType::Food), 0);
	TestEqual(TEXT("Ammo untouched by other spends"), GameState->GetStockpileCount(ESeminoleSupplyType::Ammo), Loot.Ammo);

	// Inventory add/remove/query on their own.
	Inventory->AddSupplies(ESeminoleSupplyType::Ammo, 2);
	TestEqual(TEXT("AddSupplies adds"), Inventory->GetSupplyCount(ESeminoleSupplyType::Ammo), 2);
	TestFalse(TEXT("RemoveSupplies refuses more than carried"), Inventory->RemoveSupplies(ESeminoleSupplyType::Ammo, 3));
	TestEqual(TEXT("Refused removal changes nothing"), Inventory->GetSupplyCount(ESeminoleSupplyType::Ammo), 2);
	TestTrue(TEXT("RemoveSupplies removes what is carried"), Inventory->RemoveSupplies(ESeminoleSupplyType::Ammo, 2));
	TestTrue(TEXT("Inventory empty again"), Inventory->IsEmpty());

	return true;
}

#undef SEMINOLE_TEST_FLAGS

#endif // WITH_DEV_AUTOMATION_TESTS

// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

#include "AI/BloodRitualInfected.h"
#include "AI/BloodRitualInfectedController.h"
#include "BloodRitualSettings.h"
#include "Combat/BloodRitualWeaponComponent.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "Tests/BloodRitualTestWorld.h"
#include "World/BloodRitualNoiseSubsystem.h"
#include "GameFramework/Actor.h"

namespace BloodRitualCombatTestHelpers
{
	/** A bare actor carrying the components the weapons need, standing in for the player pawn. */
	AActor* SpawnShooter(const FBloodRitualTestWorld& TestWorld, UBloodRitualInventoryComponent*& OutInventory, UBloodRitualWeaponComponent*& OutWeapons)
	{
		AActor* Shooter = TestWorld.SpawnActor<AActor>();
		if (Shooter == nullptr)
		{
			return nullptr;
		}
		OutInventory = NewObject<UBloodRitualInventoryComponent>(Shooter);
		OutInventory->RegisterComponent();
		OutWeapons = NewObject<UBloodRitualWeaponComponent>(Shooter);
		OutWeapons->RegisterComponent();
		return Shooter;
	}
}

/**
 * Health: damage takes health down and never below zero, the killing blow reports only what
 * was left, the dead take no more damage, and a reset brings full health back.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FBloodRitualHealthTest, "BloodRitual.Combat.Health",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FBloodRitualHealthTest::RunTest(const FString& Parameters)
{
	FBloodRitualTestWorld TestWorld;
	AActor* Owner = TestWorld.SpawnActor<AActor>();
	if (!TestNotNull(TEXT("Owner"), Owner))
	{
		return false;
	}
	UBloodRitualHealthComponent* Health = NewObject<UBloodRitualHealthComponent>(Owner);
	Health->RegisterComponent();
	Health->SetMaxHealth(100.0f);

	TestEqual(TEXT("Starts full"), Health->GetHealth(), 100.0f);
	TestEqual(TEXT("A 30 hit takes 30"), Health->ApplyDamage(30.0f, nullptr), 30.0f);
	TestEqual(TEXT("70 left"), Health->GetHealth(), 70.0f);
	TestFalse(TEXT("Alive at 70"), Health->IsDead());
	TestEqual(TEXT("Negative damage does nothing"), Health->ApplyDamage(-5.0f, nullptr), 0.0f);
	TestEqual(TEXT("An overkill takes only what was left"), Health->ApplyDamage(500.0f, nullptr), 70.0f);
	TestEqual(TEXT("Never below zero"), Health->GetHealth(), 0.0f);
	TestTrue(TEXT("Dead at zero"), Health->IsDead());
	TestEqual(TEXT("The dead take no more damage"), Health->ApplyDamage(10.0f, nullptr), 0.0f);
	Health->ResetHealth();
	TestEqual(TEXT("Reset refills"), Health->GetHealth(), 100.0f);
	TestFalse(TEXT("Reset revives"), Health->IsDead());
	return true;
}

/**
 * Rifle and bow ammunition: an empty rifle dry-fires; a reload takes rounds from carried Ammo
 * up to the magazine when it completes; a shot uses one round and the next waits for the shot
 * interval; a full magazine needs no reload; switching weapons abandons a reload. Each arrow
 * costs one carried Ammo and the bow dry-fires without any.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FBloodRitualWeaponAmmoTest, "BloodRitual.Combat.WeaponAmmo",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FBloodRitualWeaponAmmoTest::RunTest(const FString& Parameters)
{
	FBloodRitualTestWorld TestWorld;
	UBloodRitualInventoryComponent* Inventory = nullptr;
	UBloodRitualWeaponComponent* Weapons = nullptr;
	AActor* Shooter = BloodRitualCombatTestHelpers::SpawnShooter(TestWorld, Inventory, Weapons);
	if (!TestNotNull(TEXT("Shooter"), Shooter))
	{
		return false;
	}
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	const int32 Magazine = Settings->RifleMagazineSize;
	const FVector View(-300.0f, 0.0f, 100.0f);
	const FVector Forward(1.0f, 0.0f, 0.0f);

	Inventory->AddSupply(EBloodRitualSupplyType::Ammo, Magazine + 2);
	TestEqual(TEXT("Rifle held"), Weapons->SelectWeapon(EBloodRitualWeapon::Rifle), EBloodRitualWeapon::Rifle);
	TestEqual(TEXT("Empty rifle dry-fires"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::DryFire);

	TestTrue(TEXT("Reload starts"), Weapons->StartReload());
	TestEqual(TEXT("Nothing loaded before the reload completes"), Weapons->GetLoadedRounds(), 0);
	Weapons->Advance(Settings->RifleReloadSeconds + 0.01f);
	TestEqual(TEXT("A full magazine after the reload"), Weapons->GetLoadedRounds(), Magazine);
	TestEqual(TEXT("Taken from carried Ammo"), Weapons->GetCarriedAmmo(), 2);
	TestFalse(TEXT("A full magazine needs no reload"), Weapons->StartReload());

	TestEqual(TEXT("A loaded rifle fires"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::Shot);
	TestEqual(TEXT("One round used"), Weapons->GetLoadedRounds(), Magazine - 1);
	TestEqual(TEXT("The next shot waits for the lever"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::None);
	Weapons->Advance(Settings->RifleShotIntervalSeconds + 0.01f);
	TestEqual(TEXT("Then fires"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::Shot);
	Weapons->Advance(Settings->RifleShotIntervalSeconds + 0.01f);

	TestTrue(TEXT("A part-empty magazine reloads"), Weapons->StartReload());
	Weapons->SelectWeapon(EBloodRitualWeapon::Bow);
	TestFalse(TEXT("Switching abandons the reload"), Weapons->IsReloading());
	Weapons->Advance(Settings->RifleReloadSeconds + 0.01f);
	TestEqual(TEXT("Carried Ammo untouched by the abandoned reload"), Weapons->GetCarriedAmmo(), 2);

	TestEqual(TEXT("An arrow leaves"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::Shot);
	TestEqual(TEXT("An arrow costs one Ammo"), Weapons->GetCarriedAmmo(), 1);
	Weapons->Advance(Settings->BowShotIntervalSeconds + 0.01f);
	TestEqual(TEXT("Another arrow"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::Shot);
	Weapons->Advance(Settings->BowShotIntervalSeconds + 0.01f);
	TestEqual(TEXT("No Ammo, no arrow"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::DryFire);

	TestEqual(TEXT("Selecting the held weapon puts it away"), Weapons->SelectWeapon(EBloodRitualWeapon::Bow), EBloodRitualWeapon::None);
	TestEqual(TEXT("Unarmed does not attack"), Weapons->Attack(View, Forward), EBloodRitualAttackResult::None);
	return true;
}

/**
 * Infected senses and states: a noise that reaches a registered infected sends it to
 * investigate the noise's location; being hurt makes it chase the attacker (and a later noise
 * does not distract it); death ends the brain.
 */
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FBloodRitualInfectedBrainTest, "BloodRitual.AI.InfectedBrain",
	EAutomationTestFlags_ApplicationContextMask | EAutomationTestFlags::ProductFilter)

bool FBloodRitualInfectedBrainTest::RunTest(const FString& Parameters)
{
	FBloodRitualTestWorld TestWorld;
	UWorld* World = TestWorld.GetWorld();
	ABloodRitualInfected* Infected = TestWorld.SpawnActor<ABloodRitualInfected>(FVector(0.0f, 0.0f, 100.0f));
	if (!TestNotNull(TEXT("Infected"), Infected))
	{
		return false;
	}
	ABloodRitualInfectedController* Brain = Cast<ABloodRitualInfectedController>(Infected->GetController());
	if (Brain == nullptr)
	{
		Brain = World->SpawnActor<ABloodRitualInfectedController>();
		if (Brain != nullptr)
		{
			Brain->Possess(Infected);
		}
	}
	if (!TestNotNull(TEXT("Infected controller"), Brain))
	{
		return false;
	}
	TestEqual(TEXT("Starts wandering"), Brain->GetState(), EBloodRitualInfectedState::Wander);

	UBloodRitualNoiseSubsystem* Noise = World->GetSubsystem<UBloodRitualNoiseSubsystem>();
	if (!TestNotNull(TEXT("Noise subsystem"), Noise))
	{
		return false;
	}
	// No game mode, so BeginPlay (which registers) does not run; register by hand.
	Noise->RegisterListener(Infected);
	const FVector Far(5000.0f, 0.0f, 0.0f);
	Noise->EmitNoise(Far, 1000.0f, nullptr);
	TestEqual(TEXT("A noise out of earshot changes nothing"), Brain->GetState(), EBloodRitualInfectedState::Wander);
	const FVector Shot(800.0f, 300.0f, 0.0f);
	Noise->EmitNoise(Shot, 3000.0f, nullptr);
	TestEqual(TEXT("A noise in earshot sends it to investigate"), Brain->GetState(), EBloodRitualInfectedState::Investigate);
	TestEqual(TEXT("It goes to where the noise was"), Brain->GetDestination(), Shot);

	AActor* Attacker = TestWorld.SpawnActor<AActor>(FVector(600.0f, 0.0f, 100.0f));
	Brain->NotifyAttacked(Attacker);
	TestEqual(TEXT("Being hurt starts a chase"), Brain->GetState(), EBloodRitualInfectedState::Chase);
	TestTrue(TEXT("It chases the attacker"), Brain->GetTarget() == Attacker);
	Noise->EmitNoise(Shot, 3000.0f, nullptr);
	TestEqual(TEXT("A noise does not distract a chase"), Brain->GetState(), EBloodRitualInfectedState::Chase);

	Brain->NotifyDied();
	TestEqual(TEXT("Death ends the brain"), Brain->GetState(), EBloodRitualInfectedState::Dead);
	Noise->UnregisterListener(Infected);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS

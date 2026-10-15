// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Survival/BloodRitualHealthComponent.h"

#include "GameFramework/Actor.h"

UBloodRitualHealthComponent::UBloodRitualHealthComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UBloodRitualHealthComponent::BeginPlay()
{
	Super::BeginPlay();

	if (AActor* Owner = GetOwner())
	{
		Owner->OnTakeAnyDamage.AddUniqueDynamic(this, &UBloodRitualHealthComponent::HandleTakeAnyDamage);
	}
}

void UBloodRitualHealthComponent::SetMaxHealth(float NewMaxHealth)
{
	MaxHealth = FMath::Max(NewMaxHealth, 1.0f);
	ResetHealth();
}

float UBloodRitualHealthComponent::ApplyDamage(float Amount, AActor* DamageCauser)
{
	if (bDead || Amount <= 0.0f)
	{
		return 0.0f;
	}

	const float Taken = FMath::Min(Amount, Health);
	Health -= Taken;
	if (Health <= 0.0f)
	{
		Health = 0.0f;
		bDead = true;
		OnDied.Broadcast(this, DamageCauser);
	}
	else
	{
		OnDamaged.Broadcast(this, Taken, DamageCauser);
	}
	return Taken;
}

void UBloodRitualHealthComponent::ResetHealth()
{
	Health = MaxHealth;
	bDead = false;
}

void UBloodRitualHealthComponent::HandleTakeAnyDamage(AActor* DamagedActor, float Damage, const UDamageType* DamageType, AController* InstigatedBy, AActor* DamageCauser)
{
	ApplyDamage(Damage, DamageCauser);
}

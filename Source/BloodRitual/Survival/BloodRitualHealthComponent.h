// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "BloodRitualHealthComponent.generated.h"

class UBloodRitualHealthComponent;
class UDamageType;
class AController;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FBloodRitualDamagedSignature, UBloodRitualHealthComponent*, Health, float, Amount, AActor*, DamageCauser);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FBloodRitualDiedSignature, UBloodRitualHealthComponent*, Health, AActor*, Killer);

/**
 * Health for anything that can be hurt (ADR 0007: plain C++ instead of the Gameplay Ability
 * System). Damage arrives through the engine's damage pipeline (UGameplayStatics::ApplyDamage ->
 * the owner's OnTakeAnyDamage, bound in BeginPlay) or directly through ApplyDamage. Health never
 * goes below zero; reaching zero fires OnDied once, and a dead owner takes no more damage until
 * ResetHealth.
 */
UCLASS(ClassGroup = (BloodRitual), meta = (BlueprintSpawnableComponent))
class BLOODRITUAL_API UBloodRitualHealthComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UBloodRitualHealthComponent();

	virtual void BeginPlay() override;

	/** Sets the maximum and refills to it. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Health")
	void SetMaxHealth(float NewMaxHealth);

	/** Takes up to Amount from health and returns what was taken (zero once dead). */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Health")
	float ApplyDamage(float Amount, AActor* DamageCauser);

	/** Back to full health and alive. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Health")
	void ResetHealth();

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Health")
	float GetHealth() const { return Health; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Health")
	float GetMaxHealth() const { return MaxHealth; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Health")
	float GetHealthFraction() const { return MaxHealth > 0.0f ? Health / MaxHealth : 0.0f; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Health")
	bool IsDead() const { return bDead; }

	/** After every hit that took health (not the killing one's death; that is OnDied). */
	UPROPERTY(BlueprintAssignable, Category = "BloodRitual|Health")
	FBloodRitualDamagedSignature OnDamaged;

	/** Once, when health reaches zero. */
	UPROPERTY(BlueprintAssignable, Category = "BloodRitual|Health")
	FBloodRitualDiedSignature OnDied;

private:
	UFUNCTION()
	void HandleTakeAnyDamage(AActor* DamagedActor, float Damage, const UDamageType* DamageType, AController* InstigatedBy, AActor* DamageCauser);

	UPROPERTY(EditAnywhere, Category = "BloodRitual|Health", meta = (ClampMin = "1.0"))
	float MaxHealth = 100.0f;

	UPROPERTY(VisibleInstanceOnly, Category = "BloodRitual|Health")
	float Health = 100.0f;

	bool bDead = false;
};

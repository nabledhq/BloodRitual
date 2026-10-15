// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "BloodRitualArrow.generated.h"

class UBloodRitualWeaponComponent;
class UProjectileMovementComponent;
class USphereComponent;
class UStaticMeshComponent;

/**
 * An arrow in flight: a small sphere at the tip, the arrow mesh behind it, and projectile movement
 * with a little gravity. On its first blocking hit it damages a living target (doubled on the
 * head), sticks into whatever it hit, and is removed after a while. Spawned by
 * UBloodRitualWeaponComponent with the shooter as owner and instigator.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualArrow : public AActor
{
	GENERATED_BODY()

public:
	ABloodRitualArrow();

	/** Sends it off; Damage applies to the first living thing it hits. Shooter is told of hits. */
	void Launch(const FVector& Velocity, float InDamage, UBloodRitualWeaponComponent* InShooter);

private:
	UFUNCTION()
	void HandleStop(const FHitResult& Hit);

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual")
	TObjectPtr<USphereComponent> Tip;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "BloodRitual")
	TObjectPtr<UProjectileMovementComponent> Movement;

	TWeakObjectPtr<UBloodRitualWeaponComponent> Shooter;
	float Damage = 0.0f;
};

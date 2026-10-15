// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "World/BloodRitualNoiseListener.h"
#include "BloodRitualInfected.generated.h"

class UAnimSequence;
class UBlendSpace;
class UBloodRitualHealthComponent;

/**
 * The slice's first enemy: an infected villager (scripts/blender/build_infected.py) that hears
 * noise, sees and chases players and attacks in melee. Its brain is
 * ABloodRitualInfectedController; this class is the body: health, hearing (it registers with
 * UBloodRitualNoiseSubsystem as an IBloodRitualNoiseListener), the blow, hit reactions and death.
 *
 * It shares the Protagonist's skeleton and plays his retargeted clips in single-node mode: the
 * locomotion blend space at its ground speed, the punch, a flinch when hit, and the death clip,
 * after which the body stays for InfectedCorpseSeconds without collision.
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualInfected : public ACharacter, public IBloodRitualNoiseListener
{
	GENERATED_BODY()

public:
	ABloodRitualInfected();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

	//~ IBloodRitualNoiseListener
	virtual FVector GetNoiseListenerLocation() const override;
	virtual void OnNoiseHeard(const FBloodRitualNoiseEvent& Noise) override;

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Infected")
	UBloodRitualHealthComponent* GetHealth() const { return Health; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Infected")
	bool IsDead() const;

	/** Starts a blow at Target (landing a moment later if it is still in reach). False if busy or dead. */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Infected")
	bool Attack(AActor* Target);

	/** Mid-blow or flinching. */
	UFUNCTION(BlueprintPure, Category = "BloodRitual|Infected")
	bool IsBusy() const { return ActionClip != nullptr; }

private:
	UFUNCTION()
	void HandleDamaged(UBloodRitualHealthComponent* DamagedHealth, float Amount, AActor* DamageCauser);

	UFUNCTION()
	void HandleDied(UBloodRitualHealthComponent* DeadHealth, AActor* Killer);

	void PlayAction(UAnimSequence* Clip, float PlayRate);
	void LandBlow();
	void UpdateAnimation();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "BloodRitual", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UBloodRitualHealthComponent> Health;

	UPROPERTY()
	TObjectPtr<UBlendSpace> LocomotionBlendSpace;

	UPROPERTY()
	TObjectPtr<UAnimSequence> PunchClip;

	UPROPERTY()
	TObjectPtr<UAnimSequence> HitClip;

	UPROPERTY()
	TObjectPtr<UAnimSequence> DeathClip;

	UPROPERTY()
	TObjectPtr<UAnimSequence> ActionClip;
	float ActionSecondsLeft = 0.0f;

	TWeakObjectPtr<AActor> BlowTarget;
	float BlowContactSecondsLeft = -1.0f;
	bool bListening = false;
};

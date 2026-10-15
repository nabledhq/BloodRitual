// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "Math/RandomStream.h"
#include "BloodRitualInfectedController.generated.h"

class ABloodRitualInfected;

/** What an infected is doing (docs/ARCHITECTURE.md, AI). */
UENUM(BlueprintType)
enum class EBloodRitualInfectedState : uint8
{
	/** Shambling about its home, pausing now and then. */
	Wander,
	/** Walking to a noise it heard and looking around there. */
	Investigate,
	/** Running at a player it sees (or who hurt it) and attacking in reach. */
	Chase,
	/** Lost sight of its target: going to where it was last seen and looking around. */
	Search,
	Dead
};

/**
 * The infected's brain, the documented loop Wander -> Hear Noise -> Investigate -> Detect Player
 * -> Chase -> Attack -> Lose Player -> Search -> Wander, as a small C++ state machine. ADR 0003
 * plans StateTree for AI; this first enemy keeps the same states so it can move there.
 *
 * Senses: sight (InfectedSightRange within InfectedSightAngleDegrees, with a line-of-sight
 * trace), proximity (InfectedProximityRange, any direction), noise (from the pawn's
 * IBloodRitualNoiseListener) and being hurt. It steers straight at its goal and sidesteps when
 * blocked: the runtime-spawned slice map has no NavMesh yet. All timing goes through TickBrain
 * (ticked; tests call it).
 */
UCLASS()
class BLOODRITUAL_API ABloodRitualInfectedController : public AAIController
{
	GENERATED_BODY()

public:
	ABloodRitualInfectedController();

	virtual void Tick(float DeltaSeconds) override;
	virtual void OnPossess(APawn* InPawn) override;

	/** A noise reached the pawn. Investigates it unless already chasing. */
	void HearNoise(const FVector& Location, AActor* Source);

	/** The pawn was hurt by Attacker: chase it. */
	void NotifyAttacked(AActor* Attacker);

	/** The pawn died. */
	void NotifyDied();

	void TickBrain(float DeltaSeconds);

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Infected")
	EBloodRitualInfectedState GetState() const { return State; }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Infected")
	AActor* GetTarget() const { return Target.Get(); }

	UFUNCTION(BlueprintPure, Category = "BloodRitual|Infected")
	FVector GetDestination() const { return Destination; }

private:
	ABloodRitualInfected* GetInfected() const;

	/** The nearest living player pawn the pawn can see or is close to, if any. */
	AActor* FindTarget() const;
	bool CanSense(const AActor* Candidate) const;
	static bool IsAlive(const AActor* Candidate);

	void EnterState(EBloodRitualInfectedState NewState);
	void TickWander(float DeltaSeconds);
	void TickGoAndLook(float DeltaSeconds, float Speed);
	void TickChase(float DeltaSeconds);

	/** Steers the pawn towards Goal at Speed; returns true once within Tolerance. */
	bool MoveTowards(const FVector& Goal, float Speed, float Tolerance, float DeltaSeconds);

	EBloodRitualInfectedState State = EBloodRitualInfectedState::Wander;
	TWeakObjectPtr<AActor> Target;
	FVector Home = FVector::ZeroVector;
	FVector Destination = FVector::ZeroVector;
	bool bHasDestination = false;
	float WaitSecondsLeft = 0.0f;
	float SecondsUnseen = 0.0f;
	float AttackCooldownLeft = 0.0f;
	float StuckSeconds = 0.0f;
	float SidestepSecondsLeft = 0.0f;
	FVector SidestepDirection = FVector::ZeroVector;
	FRandomStream Random;
};

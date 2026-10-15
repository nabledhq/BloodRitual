// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "AI/BloodRitualInfectedController.h"

#include "AI/BloodRitualInfected.h"
#include "BloodRitualSettings.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"

namespace BloodRitualInfectedBrain
{
	constexpr float EyeHeight = 60.0f;
	constexpr float ArriveTolerance = 80.0f;
	constexpr float LookAroundSeconds = 3.0f;
	constexpr float WanderPauseChance = 0.4f;
	constexpr float MinWanderPauseSeconds = 2.0f;
	constexpr float MaxWanderPauseSeconds = 5.0f;
	// Trying to move but barely moving for this long counts as blocked; then it sidesteps.
	constexpr float StuckSpeed = 20.0f;
	constexpr float StuckSeconds = 0.8f;
	constexpr float SidestepSeconds = 0.7f;
}

ABloodRitualInfectedController::ABloodRitualInfectedController()
{
	PrimaryActorTick.bCanEverTick = true;
	bWantsPlayerState = false;
	Random.GenerateNewSeed();
}

void ABloodRitualInfectedController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);

	if (InPawn != nullptr)
	{
		Home = InPawn->GetActorLocation();
	}
	EnterState(EBloodRitualInfectedState::Wander);
}

void ABloodRitualInfectedController::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	TickBrain(DeltaSeconds);
}

ABloodRitualInfected* ABloodRitualInfectedController::GetInfected() const
{
	return Cast<ABloodRitualInfected>(GetPawn());
}

void ABloodRitualInfectedController::HearNoise(const FVector& Location, AActor* Source)
{
	if (State == EBloodRitualInfectedState::Dead || State == EBloodRitualInfectedState::Chase)
	{
		return;
	}
	Destination = Location;
	bHasDestination = true;
	EnterState(EBloodRitualInfectedState::Investigate);
}

void ABloodRitualInfectedController::NotifyAttacked(AActor* Attacker)
{
	if (State == EBloodRitualInfectedState::Dead || !IsAlive(Attacker))
	{
		return;
	}
	Target = Attacker;
	EnterState(EBloodRitualInfectedState::Chase);
}

void ABloodRitualInfectedController::NotifyDied()
{
	EnterState(EBloodRitualInfectedState::Dead);
}

void ABloodRitualInfectedController::EnterState(EBloodRitualInfectedState NewState)
{
	State = NewState;
	WaitSecondsLeft = 0.0f;
	SecondsUnseen = 0.0f;
	StuckSeconds = 0.0f;
	if (NewState == EBloodRitualInfectedState::Wander)
	{
		bHasDestination = false;
		Target = nullptr;
	}
	if (NewState == EBloodRitualInfectedState::Chase && Target.IsValid())
	{
		Destination = Target->GetActorLocation();
		bHasDestination = true;
	}
}

void ABloodRitualInfectedController::TickBrain(float DeltaSeconds)
{
	ABloodRitualInfected* Infected = GetInfected();
	if (Infected == nullptr || DeltaSeconds <= 0.0f)
	{
		return;
	}
	if (Infected->IsDead())
	{
		State = EBloodRitualInfectedState::Dead;
		return;
	}
	AttackCooldownLeft = FMath::Max(AttackCooldownLeft - DeltaSeconds, 0.0f);

	// Detect Player: anything it can see or is close to starts (or refreshes) a chase.
	if (State != EBloodRitualInfectedState::Chase)
	{
		if (AActor* Seen = FindTarget())
		{
			Target = Seen;
			EnterState(EBloodRitualInfectedState::Chase);
		}
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	switch (State)
	{
	case EBloodRitualInfectedState::Wander:
		TickWander(DeltaSeconds);
		break;
	case EBloodRitualInfectedState::Investigate:
		TickGoAndLook(DeltaSeconds, Settings->InfectedInvestigateSpeed);
		break;
	case EBloodRitualInfectedState::Search:
		TickGoAndLook(DeltaSeconds, Settings->InfectedInvestigateSpeed);
		break;
	case EBloodRitualInfectedState::Chase:
		TickChase(DeltaSeconds);
		break;
	default:
		break;
	}
}

void ABloodRitualInfectedController::TickWander(float DeltaSeconds)
{
	if (WaitSecondsLeft > 0.0f)
	{
		WaitSecondsLeft -= DeltaSeconds;
		return;
	}
	if (!bHasDestination)
	{
		if (Random.FRand() < BloodRitualInfectedBrain::WanderPauseChance)
		{
			WaitSecondsLeft = Random.FRandRange(BloodRitualInfectedBrain::MinWanderPauseSeconds, BloodRitualInfectedBrain::MaxWanderPauseSeconds);
			bHasDestination = false;
			return;
		}
		const float Radius = GetDefault<UBloodRitualSettings>()->InfectedWanderRadius;
		const float Angle = Random.FRandRange(0.0f, 2.0f * PI);
		const float Distance = Radius * FMath::Sqrt(Random.FRand());
		Destination = Home + FVector(FMath::Cos(Angle) * Distance, FMath::Sin(Angle) * Distance, 0.0f);
		bHasDestination = true;
	}
	if (MoveTowards(Destination, GetDefault<UBloodRitualSettings>()->InfectedWalkSpeed, BloodRitualInfectedBrain::ArriveTolerance, DeltaSeconds))
	{
		bHasDestination = false;
	}
}

void ABloodRitualInfectedController::TickGoAndLook(float DeltaSeconds, float Speed)
{
	if (WaitSecondsLeft > 0.0f)
	{
		// Looking around where the noise (or the player) was; then back to wandering.
		WaitSecondsLeft -= DeltaSeconds;
		if (WaitSecondsLeft <= 0.0f)
		{
			EnterState(EBloodRitualInfectedState::Wander);
		}
		return;
	}
	if (MoveTowards(Destination, Speed, BloodRitualInfectedBrain::ArriveTolerance, DeltaSeconds))
	{
		WaitSecondsLeft = BloodRitualInfectedBrain::LookAroundSeconds;
	}
}

void ABloodRitualInfectedController::TickChase(float DeltaSeconds)
{
	ABloodRitualInfected* Infected = GetInfected();
	AActor* Chased = Target.Get();
	if (!IsAlive(Chased))
	{
		EnterState(EBloodRitualInfectedState::Wander);
		return;
	}

	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	if (CanSense(Chased))
	{
		SecondsUnseen = 0.0f;
		Destination = Chased->GetActorLocation();
	}
	else
	{
		// Lose Player: after a while without seeing it, search where it was last seen.
		SecondsUnseen += DeltaSeconds;
		if (SecondsUnseen >= Settings->InfectedLoseTargetSeconds)
		{
			EnterState(EBloodRitualInfectedState::Search);
			bHasDestination = true;
			return;
		}
	}

	const float Distance = FVector::Dist2D(Infected->GetActorLocation(), Chased->GetActorLocation());
	if (Distance <= Settings->InfectedAttackRange)
	{
		if (AttackCooldownLeft <= 0.0f && Infected->Attack(Chased))
		{
			AttackCooldownLeft = Settings->InfectedAttackIntervalSeconds;
		}
		return;
	}
	if (!Infected->IsBusy())
	{
		MoveTowards(Destination, Settings->InfectedChaseSpeed, Settings->InfectedAttackRange * 0.8f, DeltaSeconds);
	}
}

bool ABloodRitualInfectedController::MoveTowards(const FVector& Goal, float Speed, float Tolerance, float DeltaSeconds)
{
	ABloodRitualInfected* Infected = GetInfected();
	if (Infected == nullptr)
	{
		return false;
	}
	FVector ToGoal = Goal - Infected->GetActorLocation();
	ToGoal.Z = 0.0f;
	if (ToGoal.Size() <= Tolerance)
	{
		StuckSeconds = 0.0f;
		return true;
	}

	UCharacterMovementComponent* Movement = Infected->GetCharacterMovement();
	Movement->MaxWalkSpeed = Speed;

	FVector Direction = ToGoal.GetSafeNormal();
	if (SidestepSecondsLeft > 0.0f)
	{
		SidestepSecondsLeft -= DeltaSeconds;
		Direction = (Direction * 0.3f + SidestepDirection).GetSafeNormal();
	}
	else if (Infected->GetVelocity().Size2D() < BloodRitualInfectedBrain::StuckSpeed && !Infected->IsBusy())
	{
		// Blocked (a crate, a rock, another infected): step to one side for a moment.
		StuckSeconds += DeltaSeconds;
		if (StuckSeconds >= BloodRitualInfectedBrain::StuckSeconds)
		{
			StuckSeconds = 0.0f;
			SidestepSecondsLeft = BloodRitualInfectedBrain::SidestepSeconds;
			SidestepDirection = FVector::CrossProduct(Direction, FVector::UpVector) * (Random.FRand() < 0.5f ? -1.0f : 1.0f);
		}
	}
	else
	{
		StuckSeconds = 0.0f;
	}
	Infected->AddMovementInput(Direction, 1.0f);
	return false;
}

AActor* ABloodRitualInfectedController::FindTarget() const
{
	const UWorld* World = GetWorld();
	const APawn* Self = GetPawn();
	if (World == nullptr || Self == nullptr)
	{
		return nullptr;
	}
	AActor* Best = nullptr;
	float BestDistance = TNumericLimits<float>::Max();
	for (FConstPlayerControllerIterator It = World->GetPlayerControllerIterator(); It; ++It)
	{
		APawn* Candidate = It->Get() != nullptr ? It->Get()->GetPawn() : nullptr;
		if (Candidate == nullptr || !CanSense(Candidate))
		{
			continue;
		}
		const float Distance = FVector::Dist(Self->GetActorLocation(), Candidate->GetActorLocation());
		if (Distance < BestDistance)
		{
			BestDistance = Distance;
			Best = Candidate;
		}
	}
	return Best;
}

bool ABloodRitualInfectedController::CanSense(const AActor* Candidate) const
{
	const APawn* Self = GetPawn();
	if (Self == nullptr || !IsAlive(Candidate))
	{
		return false;
	}
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	const FVector Eye = Self->GetActorLocation() + FVector(0.0f, 0.0f, BloodRitualInfectedBrain::EyeHeight);
	const FVector ToCandidate = Candidate->GetActorLocation() - Self->GetActorLocation();
	const float Distance = ToCandidate.Size();
	if (Distance <= Settings->InfectedProximityRange)
	{
		return true;
	}
	if (Distance > Settings->InfectedSightRange)
	{
		return false;
	}
	const float CosHalfAngle = FMath::Cos(FMath::DegreesToRadians(Settings->InfectedSightAngleDegrees * 0.5f));
	if (FVector::DotProduct(ToCandidate.GetSafeNormal2D(), Self->GetActorForwardVector().GetSafeNormal2D()) < CosHalfAngle)
	{
		return false;
	}
	// Line of sight: only the world blocks it (other characters do not).
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(BloodRitualInfectedSight), false, Self);
	Params.AddIgnoredActor(Candidate);
	const FVector TargetEye = Candidate->GetActorLocation() + FVector(0.0f, 0.0f, BloodRitualInfectedBrain::EyeHeight);
	return !GetWorld()->LineTraceSingleByObjectType(Hit, Eye, TargetEye, FCollisionObjectQueryParams(ECC_WorldStatic), Params);
}

bool ABloodRitualInfectedController::IsAlive(const AActor* Candidate)
{
	if (Candidate == nullptr || !IsValid(Candidate))
	{
		return false;
	}
	const UBloodRitualHealthComponent* Health = Candidate->FindComponentByClass<UBloodRitualHealthComponent>();
	return Health == nullptr || !Health->IsDead();
}

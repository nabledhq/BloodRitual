// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "Survival/BloodRitualDayClockComponent.h"

#include "BloodRitual.h"
#include "BloodRitualSettings.h"

FString BloodRitualDayPhaseToString(EBloodRitualDayPhase Phase)
{
	switch (Phase)
	{
	case EBloodRitualDayPhase::Day:
		return TEXT("Day");
	case EBloodRitualDayPhase::Dusk:
		return TEXT("Dusk");
	case EBloodRitualDayPhase::Night:
		return TEXT("Night");
	default:
		return TEXT("Unknown");
	}
}

UBloodRitualDayClockComponent::UBloodRitualDayClockComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

void UBloodRitualDayClockComponent::BeginPlay()
{
	Super::BeginPlay();

	// The game starts in Day, with no console command needed.
	ResetToDay();
}

void UBloodRitualDayClockComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	Advance(DeltaTime);
}

float UBloodRitualDayClockComponent::GetPhaseProgress() const
{
	if (Phase == EBloodRitualDayPhase::Night || PhaseDuration <= 0.0f)
	{
		return 1.0f;
	}
	return FMath::Clamp(1.0f - PhaseTimeRemaining / PhaseDuration, 0.0f, 1.0f);
}

void UBloodRitualDayClockComponent::ResetToDay()
{
	bStarted = true;
	EnterPhase(EBloodRitualDayPhase::Day);
}

void UBloodRitualDayClockComponent::Advance(float DeltaSeconds)
{
	if (!bStarted || DeltaSeconds <= 0.0f)
	{
		return;
	}

	float Remaining = DeltaSeconds;
	while (Remaining > 0.0f && Phase != EBloodRitualDayPhase::Night)
	{
		if (PhaseTimeRemaining > Remaining)
		{
			PhaseTimeRemaining -= Remaining;
			return;
		}

		// The phase ends inside this step; carry the leftover into the next phase so a large
		// step crosses several boundaries in order.
		Remaining -= PhaseTimeRemaining;
		PhaseTimeRemaining = 0.0f;

		switch (Phase)
		{
		case EBloodRitualDayPhase::Day:
			EnterPhase(EBloodRitualDayPhase::Dusk);
			break;
		case EBloodRitualDayPhase::Dusk:
			EnterPhase(EBloodRitualDayPhase::Night);
			break;
		default:
			return;
		}
	}
}

void UBloodRitualDayClockComponent::EnterPhase(EBloodRitualDayPhase NewPhase)
{
	Phase = NewPhase;
	PhaseDuration = GetConfiguredDuration(NewPhase);
	PhaseTimeRemaining = PhaseDuration;

	UE_LOG(LogBloodRitual, Log, TEXT("BloodRitualDayClock: %s begins (%.0f s)."), *BloodRitualDayPhaseToString(NewPhase), PhaseDuration);
	OnPhaseChanged.Broadcast(NewPhase);
}

float UBloodRitualDayClockComponent::GetConfiguredDuration(EBloodRitualDayPhase ForPhase) const
{
	const UBloodRitualSettings* Settings = GetDefault<UBloodRitualSettings>();
	switch (ForPhase)
	{
	case EBloodRitualDayPhase::Day:
		return Settings->DayDurationSeconds;
	case EBloodRitualDayPhase::Dusk:
		return Settings->DuskDurationSeconds;
	default:
		// Night has no end in part 1; part 3 ends it through ResetToDay().
		return 0.0f;
	}
}

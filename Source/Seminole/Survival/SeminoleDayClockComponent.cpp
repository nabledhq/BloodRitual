// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Survival/SeminoleDayClockComponent.h"

#include "Seminole.h"
#include "SeminoleSettings.h"

FString SeminoleDayPhaseToString(ESeminoleDayPhase Phase)
{
	switch (Phase)
	{
	case ESeminoleDayPhase::Day:
		return TEXT("Day");
	case ESeminoleDayPhase::Dusk:
		return TEXT("Dusk");
	case ESeminoleDayPhase::Night:
		return TEXT("Night");
	default:
		return TEXT("Unknown");
	}
}

USeminoleDayClockComponent::USeminoleDayClockComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

void USeminoleDayClockComponent::BeginPlay()
{
	Super::BeginPlay();

	// The game starts in Day, with no console command needed.
	ResetToDay();
}

void USeminoleDayClockComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	Advance(DeltaTime);
}

float USeminoleDayClockComponent::GetPhaseProgress() const
{
	if (Phase == ESeminoleDayPhase::Night || PhaseDuration <= 0.0f)
	{
		return 1.0f;
	}
	return FMath::Clamp(1.0f - PhaseTimeRemaining / PhaseDuration, 0.0f, 1.0f);
}

void USeminoleDayClockComponent::ResetToDay()
{
	bStarted = true;
	EnterPhase(ESeminoleDayPhase::Day);
}

void USeminoleDayClockComponent::Advance(float DeltaSeconds)
{
	if (!bStarted || DeltaSeconds <= 0.0f)
	{
		return;
	}

	float Remaining = DeltaSeconds;
	while (Remaining > 0.0f && Phase != ESeminoleDayPhase::Night)
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
		case ESeminoleDayPhase::Day:
			EnterPhase(ESeminoleDayPhase::Dusk);
			break;
		case ESeminoleDayPhase::Dusk:
			EnterPhase(ESeminoleDayPhase::Night);
			break;
		default:
			return;
		}
	}
}

void USeminoleDayClockComponent::EnterPhase(ESeminoleDayPhase NewPhase)
{
	Phase = NewPhase;
	PhaseDuration = GetConfiguredDuration(NewPhase);
	PhaseTimeRemaining = PhaseDuration;

	UE_LOG(LogSeminole, Log, TEXT("SeminoleDayClock: %s begins (%.0f s)."), *SeminoleDayPhaseToString(NewPhase), PhaseDuration);
	OnPhaseChanged.Broadcast(NewPhase);
}

float USeminoleDayClockComponent::GetConfiguredDuration(ESeminoleDayPhase ForPhase) const
{
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	switch (ForPhase)
	{
	case ESeminoleDayPhase::Day:
		return Settings->DayDurationSeconds;
	case ESeminoleDayPhase::Dusk:
		return Settings->DuskDurationSeconds;
	default:
		// Night has no end in part 1; part 3 ends it through ResetToDay().
		return 0.0f;
	}
}

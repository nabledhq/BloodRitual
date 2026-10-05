// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "Survival/SeminoleDayClockSubsystem.h"

#include "Seminole.h"
#include "SeminoleSettings.h"
#include "Engine/World.h"

void USeminoleDayClockSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Start in Day with the full duration; no console command or Blueprint call is needed.
	Phase = ESeminoleDayPhase::Day;
	TimeRemaining = GetPhaseDuration(ESeminoleDayPhase::Day);
}

bool USeminoleDayClockSubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	// Game and PIE only: the clock must not run in the editor viewport or in editor preview worlds.
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

void USeminoleDayClockSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	const UWorld* World = GetWorld();
	if (World == nullptr || !World->HasBegunPlay())
	{
		return;
	}

	AdvanceTime(DeltaTime);
}

TStatId USeminoleDayClockSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(USeminoleDayClockSubsystem, STATGROUP_Tickables);
}

float USeminoleDayClockSubsystem::GetPhaseDuration(ESeminoleDayPhase InPhase) const
{
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	switch (InPhase)
	{
	case ESeminoleDayPhase::Day:
		return Settings->DayDurationSeconds;
	case ESeminoleDayPhase::Dusk:
		return Settings->DuskDurationSeconds;
	case ESeminoleDayPhase::Night:
	default:
		return 0.0f;
	}
}

float USeminoleDayClockSubsystem::GetPhaseProgress() const
{
	const float Duration = GetPhaseDuration(Phase);
	if (Duration <= 0.0f)
	{
		return 1.0f;
	}
	return FMath::Clamp(1.0f - TimeRemaining / Duration, 0.0f, 1.0f);
}

void USeminoleDayClockSubsystem::ResetToDay()
{
	TimeRemaining = GetPhaseDuration(ESeminoleDayPhase::Day);
	SetPhase(ESeminoleDayPhase::Day);
}

void USeminoleDayClockSubsystem::AdvanceTime(float Seconds)
{
	if (Seconds <= 0.0f || Phase == ESeminoleDayPhase::Night)
	{
		return;
	}

	float Remaining = Seconds;
	// A single large step (long hitch, or a test) may cross more than one boundary.
	while (Remaining > 0.0f && Phase != ESeminoleDayPhase::Night)
	{
		if (Remaining < TimeRemaining)
		{
			TimeRemaining -= Remaining;
			return;
		}

		Remaining -= TimeRemaining;
		if (Phase == ESeminoleDayPhase::Day)
		{
			TimeRemaining = GetPhaseDuration(ESeminoleDayPhase::Dusk);
			SetPhase(ESeminoleDayPhase::Dusk);
		}
		else
		{
			TimeRemaining = 0.0f;
			SetPhase(ESeminoleDayPhase::Night);
		}
	}
}

void USeminoleDayClockSubsystem::SetPhase(ESeminoleDayPhase NewPhase)
{
	Phase = NewPhase;
	UE_LOG(LogSeminole, Log, TEXT("SeminoleDayClock: phase is now %s (%.0f s)."), *SeminoleDayPhaseToString(Phase), TimeRemaining);
	OnPhaseChanged.Broadcast(Phase);
	OnPhaseChangedDynamic.Broadcast(Phase);
}

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

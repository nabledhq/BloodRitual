// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Survival/BloodRitualDayClockComponent.h"
#include "UObject/Object.h"
#include "BloodRitualPhaseRecorder.generated.h"

/**
 * Test double for the day clock tests: binds to UBloodRitualDayClockComponent::OnPhaseChanged
 * (a dynamic delegate, which needs a UFUNCTION on a UObject) and records every phase in order.
 */
UCLASS()
class UBloodRitualPhaseRecorder : public UObject
{
	GENERATED_BODY()

public:
	void BindTo(UBloodRitualDayClockComponent* Clock)
	{
		Clock->OnPhaseChanged.AddDynamic(this, &UBloodRitualPhaseRecorder::HandlePhaseChanged);
	}

	UFUNCTION()
	void HandlePhaseChanged(EBloodRitualDayPhase NewPhase)
	{
		Phases.Add(NewPhase);
	}

	TArray<EBloodRitualDayPhase> Phases;
};

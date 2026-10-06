// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Survival/SeminoleDayClockComponent.h"
#include "UObject/Object.h"
#include "SeminolePhaseRecorder.generated.h"

/**
 * Test double for the day clock tests: binds to USeminoleDayClockComponent::OnPhaseChanged
 * (a dynamic delegate, which needs a UFUNCTION on a UObject) and records every phase in order.
 */
UCLASS()
class USeminolePhaseRecorder : public UObject
{
	GENERATED_BODY()

public:
	void BindTo(USeminoleDayClockComponent* Clock)
	{
		Clock->OnPhaseChanged.AddDynamic(this, &USeminolePhaseRecorder::HandlePhaseChanged);
	}

	UFUNCTION()
	void HandlePhaseChanged(ESeminoleDayPhase NewPhase)
	{
		Phases.Add(NewPhase);
	}

	TArray<ESeminoleDayPhase> Phases;
};

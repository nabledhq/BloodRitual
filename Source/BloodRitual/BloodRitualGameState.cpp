// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualGameState.h"

#include "Survival/BloodRitualDayClockComponent.h"

ABloodRitualGameState::ABloodRitualGameState()
{
	DayClock = CreateDefaultSubobject<UBloodRitualDayClockComponent>(TEXT("DayClock"));
}

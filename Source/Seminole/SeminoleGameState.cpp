// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleGameState.h"

#include "Survival/SeminoleDayClockComponent.h"

ASeminoleGameState::ASeminoleGameState()
{
	DayClock = CreateDefaultSubobject<USeminoleDayClockComponent>(TEXT("DayClock"));
}

// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "World/SeminoleDayLightingComponent.h"

#include "Seminole.h"
#include "SeminoleGameState.h"
#include "SeminoleSettings.h"
#include "Survival/SeminoleDayClockComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"

USeminoleDayLightingComponent::USeminoleDayLightingComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.bStartWithTickEnabled = true;
}

void USeminoleDayLightingComponent::BeginPlay()
{
	Super::BeginPlay();

	FindLights();
	ApplyLighting();
}

void USeminoleDayLightingComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	ApplyLighting();
}

void USeminoleDayLightingComponent::ApplyLighting()
{
	const UWorld* World = GetWorld();
	const ASeminoleGameState* GameState = World != nullptr ? World->GetGameState<ASeminoleGameState>() : nullptr;
	const USeminoleDayClockComponent* Clock = GameState != nullptr ? GameState->GetDayClock() : nullptr;
	if (Clock == nullptr)
	{
		return;
	}

	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();
	const float Progress = Clock->GetPhaseProgress();

	float SunIntensity = Settings->NightSunIntensity;
	float SkyIntensity = Settings->NightSkyLightIntensity;
	FLinearColor SunColor = Settings->NightSunColor;

	switch (Clock->GetPhase())
	{
	case ESeminoleDayPhase::Day:
		SunIntensity = FMath::Lerp(Settings->DaySunIntensity, Settings->DuskSunIntensity, Progress);
		SkyIntensity = FMath::Lerp(Settings->DaySkyLightIntensity, Settings->DuskSkyLightIntensity, Progress);
		SunColor = FMath::Lerp(Settings->DaySunColor, Settings->DuskSunColor, Progress);
		break;
	case ESeminoleDayPhase::Dusk:
		SunIntensity = FMath::Lerp(Settings->DuskSunIntensity, Settings->NightSunIntensity, Progress);
		SkyIntensity = FMath::Lerp(Settings->DuskSkyLightIntensity, Settings->NightSkyLightIntensity, Progress);
		SunColor = FMath::Lerp(Settings->DuskSunColor, Settings->NightSunColor, Progress);
		break;
	case ESeminoleDayPhase::Night:
	default:
		break;
	}

	if (Sun != nullptr)
	{
		Sun->SetIntensity(SunIntensity);
		Sun->SetLightColor(SunColor);
	}
	if (Sky != nullptr)
	{
		Sky->SetIntensity(SkyIntensity);
	}
}

void USeminoleDayLightingComponent::FindLights()
{
	Sun = nullptr;
	Sky = nullptr;

	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		if (Sun == nullptr)
		{
			Sun = It->FindComponentByClass<UDirectionalLightComponent>();
		}
		if (Sky == nullptr)
		{
			Sky = It->FindComponentByClass<USkyLightComponent>();
		}
		if (Sun != nullptr && Sky != nullptr)
		{
			break;
		}
	}

	UE_LOG(LogSeminole, Log, TEXT("SeminoleDayLighting: driving %s and %s."),
		Sun != nullptr ? TEXT("a directional light") : TEXT("no directional light"),
		Sky != nullptr ? TEXT("a sky light") : TEXT("no sky light"));
}

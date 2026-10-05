// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminoleHUD.h"

#include "SeminoleGameState.h"
#include "SeminoleSettings.h"
#include "Interaction/SeminoleInteractable.h"
#include "Interaction/SeminoleInteractionComponent.h"
#include "Inventory/SeminoleInventoryComponent.h"
#include "Inventory/SeminoleSupplyContainer.h"
#include "Survival/SeminoleDayClockSubsystem.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Pawn.h"

namespace
{
	const float Margin = 20.0f;
	const float LineSpacing = 6.0f;
	const FLinearColor TextColor(0.95f, 0.95f, 0.9f);
	const FLinearColor DimColor(0.7f, 0.7f, 0.65f);
	const FLinearColor WarningColor(1.0f, 0.55f, 0.1f);
	const FLinearColor NightColor(0.6f, 0.65f, 1.0f);

	FString FormatSeconds(float Seconds)
	{
		const int32 Whole = FMath::Max(0, FMath::CeilToInt(Seconds));
		return FString::Printf(TEXT("%d:%02d"), Whole / 60, Whole % 60);
	}
}

void ASeminoleHUD::DrawHUD()
{
	Super::DrawHUD();

	UWorld* World = GetWorld();
	if (Canvas == nullptr || World == nullptr || GEngine == nullptr)
	{
		return;
	}

	UFont* LargeFont = GEngine->GetLargeFont();
	UFont* MediumFont = GEngine->GetMediumFont();
	const USeminoleSettings* Settings = GetDefault<USeminoleSettings>();

	float Y = Margin;

	// Clock.
	if (const USeminoleDayClockSubsystem* Clock = World->GetSubsystem<USeminoleDayClockSubsystem>())
	{
		const ESeminoleDayPhase Phase = Clock->GetPhase();
		FString ClockText = SeminoleDayPhaseToString(Phase);
		if (Phase != ESeminoleDayPhase::Night)
		{
			ClockText += TEXT("  ") + FormatSeconds(Clock->GetTimeRemainingInPhase());
		}
		const FLinearColor ClockColor = Phase == ESeminoleDayPhase::Night ? NightColor : (Phase == ESeminoleDayPhase::Dusk ? WarningColor : TextColor);
		DrawLine(ClockText, Y, ClockColor, LargeFont);

		// Dusk warning banner across the top centre for the first seconds of Dusk.
		const float TimeIntoDusk = Clock->GetPhaseDuration(ESeminoleDayPhase::Dusk) - Clock->GetTimeRemainingInPhase();
		if (Phase == ESeminoleDayPhase::Dusk && TimeIntoDusk < Settings->DuskWarningSeconds)
		{
			const FString Warning = TEXT("DUSK - night is coming, return to the hub");
			float Width = 0.0f;
			float Height = 0.0f;
			GetTextSize(Warning, Width, Height, LargeFont);
			const float X = (Canvas->SizeX - Width) * 0.5f;
			const float BannerY = Margin * 3.0f;
			DrawRect(FLinearColor(0.0f, 0.0f, 0.0f, 0.6f), X - 12.0f, BannerY - 6.0f, Width + 24.0f, Height + 12.0f);
			DrawText(Warning, WarningColor, X, BannerY, LargeFont);
		}
	}

	// Carried supplies and interaction.
	APawn* Pawn = GetOwningPawn();
	if (Pawn != nullptr)
	{
		if (const USeminoleInventoryComponent* Inventory = Pawn->FindComponentByClass<USeminoleInventoryComponent>())
		{
			DrawLine(TEXT("Carrying: ") + Inventory->GetSupplies().ToString(), Y, TextColor, MediumFont);
		}
	}

	// Stockpile.
	if (const ASeminoleGameState* GameState = World->GetGameState<ASeminoleGameState>())
	{
		DrawLine(TEXT("Stockpile: ") + GameState->GetStockpile().ToString(), Y, TextColor, MediumFont);
	}

	// Prompt and search progress, bottom centre.
	if (Pawn != nullptr)
	{
		FString Prompt;
		if (const USeminoleInteractionComponent* Interaction = Pawn->FindComponentByClass<USeminoleInteractionComponent>())
		{
			if (AActor* Focused = Interaction->FindFocusedInteractable())
			{
				if (const ISeminoleInteractable* Interactable = Cast<ISeminoleInteractable>(Focused))
				{
					Prompt = TEXT("[E] ") + Interactable->GetInteractionPrompt(Pawn).ToString();
				}
			}
		}

		// A search in progress shows its bar instead of the prompt (the container refuses interaction meanwhile).
		for (TActorIterator<ASeminoleSupplyContainer> It(World); It; ++It)
		{
			if (It->IsBeingSearched())
			{
				Prompt = FString::Printf(TEXT("Searching... %d%%"), FMath::RoundToInt(It->GetSearchProgress() * 100.0f));
				break;
			}
		}

		if (!Prompt.IsEmpty())
		{
			float Width = 0.0f;
			float Height = 0.0f;
			GetTextSize(Prompt, Width, Height, MediumFont);
			DrawText(Prompt, TextColor, (Canvas->SizeX - Width) * 0.5f, Canvas->SizeY - Margin * 4.0f, MediumFont);
		}
	}

	float HelpY = Canvas->SizeY - Margin - 20.0f;
	DrawLine(TEXT("WASD move, mouse look, Space jump, E interact"), HelpY, DimColor, MediumFont);
}

void ASeminoleHUD::DrawLine(const FString& Text, float& Y, const FLinearColor& Color, UFont* Font)
{
	float Width = 0.0f;
	float Height = 0.0f;
	GetTextSize(Text, Width, Height, Font);
	DrawText(Text, Color, Margin, Y, Font);
	Y += Height + LineSpacing;
}

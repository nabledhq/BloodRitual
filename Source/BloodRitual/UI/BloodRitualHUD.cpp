// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "UI/BloodRitualHUD.h"

#include "BloodRitualGameState.h"
#include "BloodRitualSettings.h"
#include "Combat/BloodRitualWeaponComponent.h"
#include "Community/BloodRitualStockpile.h"
#include "Interaction/BloodRitualInteractionComponent.h"
#include "Inventory/BloodRitualInventoryComponent.h"
#include "Inventory/BloodRitualSupplyContainer.h"
#include "Survival/BloodRitualDayClockComponent.h"
#include "Survival/BloodRitualHealthComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/Pawn.h"

namespace
{
	constexpr float Margin = 20.0f;
	constexpr float LineHeight = 22.0f;
	const FLinearColor TextColor(0.95f, 0.95f, 0.95f);
	const FLinearColor DimColor(0.7f, 0.7f, 0.7f);
	const FLinearColor DuskColor(1.0f, 0.6f, 0.1f);
	const FLinearColor NightColor(0.9f, 0.2f, 0.2f);
	const FLinearColor PanelColor(0.0f, 0.0f, 0.0f, 0.5f);
	const FLinearColor BarColor(0.9f, 0.8f, 0.3f);
	const FLinearColor HealthColor(0.75f, 0.12f, 0.1f);
	const FLinearColor HitMarkerColor(1.0f, 0.35f, 0.25f);
	constexpr float HitMarkerSeconds = 0.25f;

	FString FormatSeconds(float Seconds)
	{
		const int32 Whole = FMath::Max(0, FMath::CeilToInt(Seconds));
		return FString::Printf(TEXT("%d:%02d"), Whole / 60, Whole % 60);
	}
}

void ABloodRitualHUD::DrawHUD()
{
	Super::DrawHUD();

	if (Canvas == nullptr || GEngine == nullptr)
	{
		return;
	}

	float Y = Margin;
	DrawClock(GetDayClock(), Y);
	DrawSupplies(Y);
	DrawInteraction();
	DrawCombat();
}

UBloodRitualDayClockComponent* ABloodRitualHUD::GetDayClock() const
{
	const UWorld* World = GetWorld();
	const ABloodRitualGameState* GameState = World != nullptr ? World->GetGameState<ABloodRitualGameState>() : nullptr;
	return GameState != nullptr ? GameState->GetDayClock() : nullptr;
}

ABloodRitualStockpile* ABloodRitualHUD::GetStockpile()
{
	if (!CachedStockpile.IsValid())
	{
		for (TActorIterator<ABloodRitualStockpile> It(GetWorld()); It; ++It)
		{
			CachedStockpile = *It;
			break;
		}
	}
	return CachedStockpile.Get();
}

void ABloodRitualHUD::DrawClock(const UBloodRitualDayClockComponent* Clock, float& Y)
{
	UFont* LargeFont = GEngine->GetLargeFont();
	UFont* MediumFont = GEngine->GetMediumFont();

	if (Clock == nullptr)
	{
		DrawText(TEXT("Day clock: not running (no BloodRitualGameState)"), DimColor, Margin, Y, MediumFont);
		Y += LineHeight;
		return;
	}

	const EBloodRitualDayPhase Phase = Clock->GetPhase();
	FString Line = BloodRitualDayPhaseToString(Phase);
	if (Phase != EBloodRitualDayPhase::Night)
	{
		Line += TEXT("  ") + FormatSeconds(Clock->GetPhaseTimeRemaining());
	}

	const FLinearColor Color = Phase == EBloodRitualDayPhase::Day ? TextColor : (Phase == EBloodRitualDayPhase::Dusk ? DuskColor : NightColor);
	DrawText(Line, Color, Margin, Y, LargeFont);
	Y += LineHeight * 1.6f;

	if (Phase == EBloodRitualDayPhase::Day)
	{
		return;
	}

	// Dusk warning (and the night notice), centred near the top of the screen.
	const FString Warning = Phase == EBloodRitualDayPhase::Dusk
		? FString::Printf(TEXT("DUSK - night falls in %s. Return to the hub!"), *FormatSeconds(Clock->GetPhaseTimeRemaining()))
		: FString(TEXT("NIGHT - the camp is on its own until dawn."));
	float TextWidth = 0.0f;
	float TextHeight = 0.0f;
	GetTextSize(Warning, TextWidth, TextHeight, LargeFont);

	const float BoxX = (Canvas->SizeX - TextWidth) * 0.5f - Margin;
	const float BoxY = Margin * 3.0f;
	DrawRect(PanelColor, BoxX, BoxY, TextWidth + Margin * 2.0f, TextHeight + Margin);
	DrawText(Warning, Color, BoxX + Margin, BoxY + Margin * 0.5f, LargeFont);
}

void ABloodRitualHUD::DrawSupplies(float& Y)
{
	UFont* MediumFont = GEngine->GetMediumFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const UBloodRitualInventoryComponent* Inventory = Pawn != nullptr ? Pawn->FindComponentByClass<UBloodRitualInventoryComponent>() : nullptr;

	const FString Carried = Inventory != nullptr ? Inventory->GetSupplies().ToString() : TEXT("(no inventory)");
	DrawText(TEXT("Carried:   ") + Carried, TextColor, Margin, Y, MediumFont);
	Y += LineHeight;

	const ABloodRitualStockpile* Stockpile = GetStockpile();
	const FString Stored = Stockpile != nullptr ? Stockpile->GetSupplies().ToString() : TEXT("(no stockpile)");
	DrawText(TEXT("Stockpile: ") + Stored, TextColor, Margin, Y, MediumFont);
	Y += LineHeight;
}

void ABloodRitualHUD::DrawInteraction()
{
	UFont* MediumFont = GEngine->GetMediumFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const UBloodRitualInteractionComponent* Interaction = Pawn != nullptr ? Pawn->FindComponentByClass<UBloodRitualInteractionComponent>() : nullptr;
	const AActor* Focused = Interaction != nullptr ? Interaction->GetFocusedInteractable() : nullptr;
	if (Focused == nullptr)
	{
		return;
	}

	const FString Prompt = TEXT("[E] ") + Interaction->GetFocusedPrompt().ToString();
	float TextWidth = 0.0f;
	float TextHeight = 0.0f;
	GetTextSize(Prompt, TextWidth, TextHeight, MediumFont);

	const float X = (Canvas->SizeX - TextWidth) * 0.5f;
	const float Y = Canvas->SizeY * 0.75f;
	DrawText(Prompt, TextColor, X, Y, MediumFont);

	// Search progress bar under the prompt while a container is being searched.
	const ABloodRitualSupplyContainer* Container = Cast<ABloodRitualSupplyContainer>(Focused);
	if (Container != nullptr && Container->IsBeingSearched())
	{
		const float BarWidth = 200.0f;
		const float BarHeight = 10.0f;
		const float BarX = (Canvas->SizeX - BarWidth) * 0.5f;
		const float BarY = Y + TextHeight + 6.0f;
		DrawRect(PanelColor, BarX, BarY, BarWidth, BarHeight);
		DrawRect(BarColor, BarX, BarY, BarWidth * Container->GetSearchProgress(), BarHeight);
	}
}

void ABloodRitualHUD::DrawCombat()
{
	UFont* MediumFont = GEngine->GetMediumFont();
	UFont* LargeFont = GEngine->GetLargeFont();

	const APlayerController* PlayerController = GetOwningPlayerController();
	const APawn* Pawn = PlayerController != nullptr ? PlayerController->GetPawn() : nullptr;
	const UBloodRitualHealthComponent* Health = Pawn != nullptr ? Pawn->FindComponentByClass<UBloodRitualHealthComponent>() : nullptr;
	const UBloodRitualWeaponComponent* Weapons = Pawn != nullptr ? Pawn->FindComponentByClass<UBloodRitualWeaponComponent>() : nullptr;

	// Health bar, bottom left.
	const float BarWidth = 260.0f;
	const float BarHeight = 14.0f;
	const float BarX = Margin;
	const float BarY = Canvas->SizeY - Margin - BarHeight;
	if (Health != nullptr)
	{
		DrawRect(PanelColor, BarX, BarY, BarWidth, BarHeight);
		DrawRect(HealthColor, BarX, BarY, BarWidth * Health->GetHealthFraction(), BarHeight);
		DrawText(FString::Printf(TEXT("Health %d"), FMath::CeilToInt(Health->GetHealth())), TextColor, BarX, BarY - LineHeight, MediumFont);
	}

	// The held weapon and its ammunition, above the health bar.
	if (Weapons != nullptr)
	{
		const EBloodRitualWeapon Weapon = Weapons->GetCurrentWeapon();
		FString Line = BloodRitualWeapons::GetDisplayName(Weapon).ToString();
		if (Weapon == EBloodRitualWeapon::Rifle)
		{
			Line += FString::Printf(TEXT("  %d / %d  (Ammo %d)"), Weapons->GetLoadedRounds(),
				GetDefault<UBloodRitualSettings>()->RifleMagazineSize, Weapons->GetCarriedAmmo());
			if (Weapons->IsReloading())
			{
				Line += TEXT("  reloading...");
			}
		}
		else if (Weapon == EBloodRitualWeapon::Bow)
		{
			Line += FString::Printf(TEXT("  arrows (Ammo) %d"), Weapons->GetCarriedAmmo());
		}
		DrawText(Line, TextColor, BarX, BarY - LineHeight * 2.0f, MediumFont);
		DrawText(TEXT("1 Tomahawk  2 Sledgehammer  3 Bow  4 Rifle  |  LMB attack  RMB aim  R reload"), DimColor, BarX, BarY - LineHeight * 3.0f, MediumFont);

		// Crosshair for ranged weapons, red briefly after a hit.
		if (Weapons->GetHold() == EBloodRitualWeaponHold::Ranged && (Health == nullptr || !Health->IsDead()))
		{
			const float CX = Canvas->SizeX * 0.5f;
			const float CY = Canvas->SizeY * 0.5f;
			const bool bHit = Weapons->GetSecondsSinceHit() < HitMarkerSeconds;
			const FLinearColor Color = bHit ? HitMarkerColor : TextColor;
			const float Gap = bHit ? 6.0f : 4.0f;
			const float Arm = 8.0f;
			DrawLine(CX - Gap - Arm, CY, CX - Gap, CY, Color, 2.0f);
			DrawLine(CX + Gap, CY, CX + Gap + Arm, CY, Color, 2.0f);
			DrawLine(CX, CY - Gap - Arm, CX, CY - Gap, Color, 2.0f);
			DrawLine(CX, CY + Gap, CX, CY + Gap + Arm, Color, 2.0f);
		}
	}

	if (Health != nullptr && Health->IsDead())
	{
		const FString Notice(TEXT("YOU DIED - the camp will send you back out"));
		float TextWidth = 0.0f;
		float TextHeight = 0.0f;
		GetTextSize(Notice, TextWidth, TextHeight, LargeFont);
		const float BoxX = (Canvas->SizeX - TextWidth) * 0.5f - Margin;
		const float BoxY = Canvas->SizeY * 0.4f;
		DrawRect(PanelColor, BoxX, BoxY, TextWidth + Margin * 2.0f, TextHeight + Margin);
		DrawText(Notice, NightColor, BoxX + Margin, BoxY + Margin * 0.5f, LargeFont);
	}
}

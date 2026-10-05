// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SeminoleHUD.generated.h"

/**
 * Placeholder HUD drawn straight to the canvas, so the slice needs no widget assets.
 *
 * Shows the day phase and time remaining, a dusk warning banner for the first
 * USeminoleSettings::DuskWarningSeconds of Dusk, the owning pawn's carried supplies, the
 * hub stockpile totals, the interaction prompt and the progress of a running search.
 * Replaced by UMG/CommonUI when the UI ticket is funded.
 */
UCLASS()
class SEMINOLE_API ASeminoleHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

private:
	void DrawLine(const FString& Text, float& Y, const FLinearColor& Color, UFont* Font);
};

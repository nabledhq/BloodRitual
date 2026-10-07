// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "BloodRitualEditorScripting.generated.h"

class UAnimSequence;
class UBlendSpace;

/**
 * Editor-only helpers for the asset scripts under scripts/editor/, for engine operations that
 * Python cannot reach. Nothing here exists in a game build.
 */
UCLASS()
class BLOODRITUAL_API UBloodRitualEditorScripting : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
#if WITH_EDITOR
	/**
	 * Replaces a blend space's samples and rebuilds the data it samples at runtime. Setting
	 * SampleData from Python stores the samples but never builds that data, so the blend space
	 * plays the reference pose. Returns false if the inputs do not line up or a sample is rejected.
	 */
	UFUNCTION(BlueprintCallable, Category = "BloodRitual|Editor Scripting")
	static bool SetBlendSpaceSamples(UBlendSpace* BlendSpace, const TArray<UAnimSequence*>& Animations, const TArray<FVector>& Positions);
#endif
};

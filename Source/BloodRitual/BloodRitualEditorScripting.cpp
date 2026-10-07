// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualEditorScripting.h"

#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace.h"

#if WITH_EDITOR
bool UBloodRitualEditorScripting::SetBlendSpaceSamples(UBlendSpace* BlendSpace, const TArray<UAnimSequence*>& Animations, const TArray<FVector>& Positions)
{
	if (BlendSpace == nullptr || Animations.Num() != Positions.Num())
	{
		return false;
	}

	BlendSpace->Modify();
	while (BlendSpace->GetNumberOfBlendSamples() > 0)
	{
		BlendSpace->DeleteSample(BlendSpace->GetNumberOfBlendSamples() - 1);
	}
	for (int32 Index = 0; Index < Animations.Num(); ++Index)
	{
		if (Animations[Index] == nullptr || BlendSpace->AddSample(Animations[Index], Positions[Index]) == INDEX_NONE)
		{
			return false;
		}
	}
	BlendSpace->ValidateSampleData();
	BlendSpace->ResampleData();
	BlendSpace->MarkPackageDirty();
	return true;
}
#endif

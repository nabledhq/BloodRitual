// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#include "BloodRitualPlaceholderVisuals.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

namespace BloodRitualPlaceholderVisuals
{
	void SetColor(UStaticMeshComponent* Mesh, const FLinearColor& Color)
	{
		if (Mesh == nullptr)
		{
			return;
		}

		for (int32 Index = 0; Index < Mesh->GetNumMaterials(); ++Index)
		{
			UMaterialInstanceDynamic* Dynamic = Cast<UMaterialInstanceDynamic>(Mesh->GetMaterial(Index));
			if (Dynamic == nullptr)
			{
				Dynamic = Mesh->CreateAndSetMaterialInstanceDynamic(Index);
			}
			if (Dynamic != nullptr)
			{
				// "Tint" multiplies the base colour of the CC0 master materials (M_PropMaster,
				// M_FoliageMaster); "Color" is /Engine/BasicShapes/BasicShapeMaterial's parameter.
				Dynamic->SetVectorParameterValue(TEXT("Tint"), Color);
				Dynamic->SetVectorParameterValue(TEXT("Color"), Color);
			}
		}
	}

	UStaticMesh* FindMesh(const TCHAR* ObjectPath)
	{
		ConstructorHelpers::FObjectFinder<UStaticMesh> Finder(ObjectPath);
		return Finder.Succeeded() ? Finder.Object : nullptr;
	}
}

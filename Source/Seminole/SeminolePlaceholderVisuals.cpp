// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminolePlaceholderVisuals.h"

#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"

namespace SeminolePlaceholderVisuals
{
	void SetColor(UStaticMeshComponent* Mesh, const FLinearColor& Color)
	{
		if (Mesh == nullptr || Mesh->GetNumMaterials() == 0)
		{
			return;
		}

		UMaterialInstanceDynamic* Dynamic = Cast<UMaterialInstanceDynamic>(Mesh->GetMaterial(0));
		if (Dynamic == nullptr)
		{
			Dynamic = Mesh->CreateAndSetMaterialInstanceDynamic(0);
		}
		if (Dynamic != nullptr)
		{
			// Parameter name of /Engine/BasicShapes/BasicShapeMaterial.
			Dynamic->SetVectorParameterValue(TEXT("Color"), Color);
		}
	}
}

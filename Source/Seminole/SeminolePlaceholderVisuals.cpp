// Copyright Seminole contributors. MIT licence; see LICENSE.

#include "SeminolePlaceholderVisuals.h"

#include "Components/MeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

void SeminoleTintPlaceholderMesh(UMeshComponent* Mesh, const FLinearColor& Color)
{
	if (Mesh == nullptr)
	{
		return;
	}

	// Reuses the instance after the first call, so repeated tints do not pile up materials.
	UMaterialInstanceDynamic* Material = Cast<UMaterialInstanceDynamic>(Mesh->GetMaterial(0));
	if (Material == nullptr)
	{
		Material = Mesh->CreateAndSetMaterialInstanceDynamic(0);
	}
	if (Material != nullptr)
	{
		// /Engine/BasicShapes/BasicShapeMaterial exposes its base colour as the "Color" vector parameter.
		Material->SetVectorParameterValue(TEXT("Color"), Color);
	}
}

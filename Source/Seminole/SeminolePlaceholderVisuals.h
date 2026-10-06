// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"

class UStaticMeshComponent;

/**
 * Helpers for the runtime-spawned placeholder primitives of the vertical slice. They all use
 * the engine's /Engine/BasicShapes meshes, whose default material exposes a "Color" vector
 * parameter; tinting through a dynamic material instance is the only "art" the slice has.
 */
namespace SeminolePlaceholderVisuals
{
	/** Creates (once) a dynamic material instance on element 0 and sets its "Color" parameter. */
	SEMINOLE_API void SetColor(UStaticMeshComponent* Mesh, const FLinearColor& Color);
}

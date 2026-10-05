// Copyright Seminole contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"

class UMeshComponent;

/**
 * Tints a placeholder primitive (/Engine/BasicShapes/*) by setting the "Color" parameter of a
 * dynamic instance of its material. Used by the slice's runtime-spawned actors instead of
 * material assets. Does nothing if the mesh has no material in slot 0.
 */
SEMINOLE_API void SeminoleTintPlaceholderMesh(UMeshComponent* Mesh, const FLinearColor& Color);

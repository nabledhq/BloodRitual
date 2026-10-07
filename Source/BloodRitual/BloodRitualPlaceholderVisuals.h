// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

#pragma once

#include "CoreMinimal.h"

class UStaticMesh;
class UStaticMeshComponent;

/**
 * Helpers for the runtime-spawned visuals of the vertical slice. They use the CC0 stand-in
 * models under /Game (imported by scripts/editor/import_cc0_assets.py), whose master materials
 * expose a "Tint" vector parameter, and fall back to the engine's /Engine/BasicShapes meshes,
 * whose default material exposes "Color", when those assets are missing (for example when Git
 * LFS content was not pulled).
 */
namespace BloodRitualPlaceholderVisuals
{
	/** Creates (once) a dynamic material instance per material slot and sets its "Tint" and "Color" parameters. */
	BLOODRITUAL_API void SetColor(UStaticMeshComponent* Mesh, const FLinearColor& Color);

	/**
	 * Resolves a static mesh from a constructor, so the class default object hard-references it
	 * and the cooker packages it. Returns null (and the engine logs the missing path) when the
	 * asset does not exist.
	 */
	BLOODRITUAL_API UStaticMesh* FindMesh(const TCHAR* ObjectPath);
}

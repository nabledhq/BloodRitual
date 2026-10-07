// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

using UnrealBuildTool;

public class BloodRitual : ModuleRules
{
	public BloodRitual(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// Headers are included by path from the module root (e.g. "Inventory/BloodRitualSupplyTypes.h").
		PublicIncludePaths.Add(ModuleDirectory);

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			// UBloodRitualSettings (UDeveloperSettings) lives in this module.
			"DeveloperSettings"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}

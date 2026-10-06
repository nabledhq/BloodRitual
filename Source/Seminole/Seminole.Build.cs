// Copyright Seminole contributors. MIT licence; see LICENSE.

using UnrealBuildTool;

public class Seminole : ModuleRules
{
	public Seminole(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// Headers are included by path from the module root (e.g. "Inventory/SeminoleSupplyTypes.h").
		PublicIncludePaths.Add(ModuleDirectory);

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			// USeminoleSettings (UDeveloperSettings) lives in this module.
			"DeveloperSettings"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}

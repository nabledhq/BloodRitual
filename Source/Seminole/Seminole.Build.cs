// Copyright Seminole contributors. MIT licence; see LICENSE.

using UnrealBuildTool;

public class Seminole : ModuleRules
{
	public Seminole(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

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

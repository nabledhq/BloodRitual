// Copyright Seminole contributors. MIT licence; see LICENSE.

using UnrealBuildTool;
using System.Collections.Generic;

public class SeminoleTarget : TargetRules
{
	public SeminoleTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("Seminole");
	}
}

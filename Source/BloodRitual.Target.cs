// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

using UnrealBuildTool;
using System.Collections.Generic;

public class BloodRitualTarget : TargetRules
{
	public BloodRitualTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("BloodRitual");
	}
}

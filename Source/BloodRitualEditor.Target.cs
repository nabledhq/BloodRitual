// Copyright Indigenous: Blood Ritual contributors. MIT licence; see LICENSE.

using UnrealBuildTool;
using System.Collections.Generic;

public class BloodRitualEditorTarget : TargetRules
{
	public BloodRitualEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("BloodRitual");
	}
}

// Copyright Seminole contributors. MIT licence; see LICENSE.

using UnrealBuildTool;
using System.Collections.Generic;

public class SeminoleEditorTarget : TargetRules
{
	public SeminoleEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("Seminole");
	}
}

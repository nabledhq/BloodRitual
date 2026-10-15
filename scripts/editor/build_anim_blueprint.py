"""Builds ABP_Protagonist, the Protagonist's Animation Blueprint, from the clips and blend spaces
that scripts/editor/import_protagonist.py made.

Output: /Game/Characters/Protagonist/ABP_Protagonist on SK_Protagonist, parented to the C++
UBloodRitualProtagonistAnimInstance (which fills the variables read here), and the UpperBody slot,
in a slot group of its own, on SK_Protagonist. ABloodRitualProtagonistCharacter loads the
Blueprint by path and plays its one-shot clips as montages in the two slots. The AnimGraph,
from the output pose back:

    Output <- Blend by bDead (true: A_Death01, once)
           <- Slot DefaultSlot                             full-body montages
           <- Layered blend per bone above spine_01
                  base:  Locomotion
                  blend: Slot UpperBody <- Locomotion      upper-body montages

    Locomotion = Layered blend above spine_01 (weight AimWeight: A_Pistol_Aim_Neutral)
              <- Blend by bFalling (true: A_Jump_Loop)
              <- Blend by bCrouched (true: BS_Crouch)
              <- Blend by bArmed (false: BS_Locomotion)
              <- Blend by bRanged (true: BS_Locomotion_Ranged, false: BS_Locomotion_Melee)

The blend spaces run over GroundSpeed. Locomotion is built twice, because UE 5.8's graph scripting
API cannot name a cached pose to share it; both copies get the same inputs every frame and stay in
step.

Needs the BloodRitual editor module built (the parent class and
UBloodRitualEditorScripting.AddAnimSlot). Re-running rebuilds the graph in place. Run headless:

    "<UE_ROOT>\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe" "<repo>\\BloodRitual.uproject" ^
        -run=pythonscript -script="<repo>\\scripts\\editor\\build_anim_blueprint.py" -unattended -nopause
"""

import unreal

FOLDER = "/Game/Characters/Protagonist"
NAME = "ABP_Protagonist"
SKELETON = FOLDER + "/SK_Protagonist"
PARENT_CLASS = "/Script/BloodRitual.BloodRitualProtagonistAnimInstance"
UPPER_BODY_SLOT = "UpperBody"
UPPER_BODY_ROOT = "spine_01"

# Seconds to blend when a pose switch flips: weapon hold and crouching, leaving the ground,
# landing, dying.
HOLD_BLEND = 0.2
FALL_BLEND = 0.15
LAND_BLEND = 0.1
DEATH_BLEND = 0.2

# Graph layout: each step back from the output is one column to the left.
COLUMN = 380
ROW = 220

assets = unreal.EditorAssetLibrary


class Graph:
    """Creates, connects and lays out nodes in an AnimGraph through unreal.BlueprintGraphEditor."""

    def __init__(self, blueprint):
        self.editor = unreal.BlueprintGraphEditor.get_graph_editor_by_name(blueprint, unreal.Name("AnimGraph"))

    def clear(self):
        """Removes every node but the output pose; returns the output pose node."""
        nodes = list(self.editor.list_all_nodes())
        root = [n for n in nodes if n.get_class().get_name() == "AnimGraphNode_Root"][0]
        others = [n for n in nodes if n != root]
        if others:
            self.editor.remove_nodes(others)
        return root

    def node(self, type_id, column, row):
        node = self.editor.create_node_from_name(type_id, unreal.Vector2D(-column * COLUMN, row * ROW), [], None)
        if node is None:
            raise RuntimeError("could not create AnimGraph node " + type_id)
        return node

    def variable(self, name, column, row):
        node = self.editor.add_get_member_variable_node(unreal.Name(name))
        if node is None:
            raise RuntimeError("no member variable " + name)
        node.set_node_pos(unreal.IntPoint(-column * COLUMN, row * ROW + 120))
        return node

    @staticmethod
    def pin(node, name):
        for pin in node.list_all_pins():
            if str(pin.get_pin_name()) == name:
                return pin
        raise RuntimeError("no pin {} on {}".format(name, node.get_name()))

    def connect(self, source, source_pin, target, target_pin):
        if not self.pin(source, source_pin).try_create_connection(self.pin(target, target_pin)):
            raise RuntimeError("could not connect {}.{} to {}.{}".format(
                source.get_name(), source_pin, target.get_name(), target_pin))

    def set_value(self, node, pin_name, value):
        if not self.pin(node, pin_name).set_pin_value(str(value)):
            raise RuntimeError("could not set {}.{} to {}".format(node.get_name(), pin_name, value))

    @staticmethod
    def set_node_struct(node, text):
        """Imports a T3D fragment into the node's runtime struct (its 'node' property)."""
        inner = node.get_editor_property("node")
        if not inner.import_text(text):
            raise RuntimeError("could not set {} on {}".format(text, node.get_name()))
        node.set_editor_property("node", inner)

    # Pose nodes. Each takes a column and row and returns the node whose "Pose" pin is the result.

    def blend_space(self, asset, column, row):
        player = self.node("Animation|BlendSpaces|BlendspacePlayer'{}'".format(asset), column, row)
        self.connect(self.variable("GroundSpeed", column + 1, row), "GroundSpeed", player, "X")
        return player

    def sequence(self, asset, column, row, loop=True):
        player = self.node("Animation|Sequences|Play'{}'".format(asset), column, row)
        if not loop:
            self.set_node_struct(player, "(bLoopAnimation=False)")
        return player

    def blend_by_bool(self, variable, when_true, when_false, blend_seconds, column, row, false_blend_seconds=None):
        """when_true and when_false are callables (column, row) -> pose node, built one column further left."""
        blend = self.node("Animation|Blends|BlendPosesbybool", column, row)
        self.connect(self.variable(variable, column + 1, row - 1), variable, blend, "bActiveValue")
        # BlendPose_0 is the True pose, BlendPose_1 the False pose; each BlendTime blends into it.
        self.connect(when_true(column + 1, row), "Pose", blend, "BlendPose_0")
        self.connect(when_false(column + 1, row + 1), "Pose", blend, "BlendPose_1")
        self.set_value(blend, "BlendTime_0", blend_seconds)
        self.set_value(blend, "BlendTime_1", blend_seconds if false_blend_seconds is None else false_blend_seconds)
        return blend

    def upper_body_layer(self, base, layer, column, row, weight_variable=None):
        """Layered blend per bone: layer's pose from UPPER_BODY_ROOT down the chain, base's elsewhere."""
        blend = self.node("Animation|Blends|Layeredblendperbone", column, row)
        self.set_node_struct(blend, '(LayerSetup=((BranchFilters=((BoneName="{}",BlendDepth=0)))))'.format(UPPER_BODY_ROOT))
        self.connect(base(column + 1, row), "Pose", blend, "BasePose")
        self.connect(layer(column + 1, row + 2), "Pose", blend, "BlendPoses_0")
        if weight_variable is not None:
            self.connect(self.variable(weight_variable, column + 1, row + 3), weight_variable, blend, "BlendWeights_0")
        return blend

    def slot(self, slot_name, source, column, row):
        slot = self.node("Animation|Montage|Slot'DefaultSlot'", column, row)
        self.set_node_struct(slot, '(SlotName="{}")'.format(slot_name))
        self.connect(source(column + 1, row), "Pose", slot, "Source")
        return slot

    def locomotion(self, column, row):
        """Ground locomotion by weapon hold and crouching, the jump loop in the air, the aim layered on top."""
        def standing(c, r):
            return self.blend_by_bool(
                "bArmed",
                lambda c2, r2: self.blend_by_bool(
                    "bRanged",
                    lambda c3, r3: self.blend_space("BS_Locomotion_Ranged", c3, r3),
                    lambda c3, r3: self.blend_space("BS_Locomotion_Melee", c3, r3),
                    HOLD_BLEND, c2, r2),
                lambda c2, r2: self.blend_space("BS_Locomotion", c2, r2 + 1),
                HOLD_BLEND, c, r)

        def grounded(c, r):
            return self.blend_by_bool(
                "bCrouched", lambda c2, r2: self.blend_space("BS_Crouch", c2, r2), standing, HOLD_BLEND, c, r)

        def airborne(c, r):
            return self.blend_by_bool(
                "bFalling", lambda c2, r2: self.sequence("A_Jump_Loop", c2, r2), grounded, FALL_BLEND, c, r,
                false_blend_seconds=LAND_BLEND)

        return self.upper_body_layer(
            airborne, lambda c, r: self.sequence("A_Pistol_Aim_Neutral", c, r), column, row, weight_variable="AimWeight")


def load_or_create_blueprint():
    path = "{}/{}".format(FOLDER, NAME)
    if assets.does_asset_exist(path):
        return unreal.load_asset(path)
    factory = unreal.AnimBlueprintFactory()
    factory.set_editor_property("target_skeleton", unreal.load_asset(SKELETON))
    factory.set_editor_property("parent_class", unreal.load_class(None, PARENT_CLASS))
    blueprint = unreal.AssetToolsHelpers.get_asset_tools().create_asset(NAME, FOLDER, unreal.AnimBlueprint, factory)
    if blueprint is None:
        raise RuntimeError("could not create " + path)
    return blueprint


def main():
    skeleton = unreal.load_asset(SKELETON)
    unreal.BloodRitualEditorScripting.add_anim_slot(skeleton, UPPER_BODY_SLOT, UPPER_BODY_SLOT)
    assets.save_loaded_asset(skeleton, only_if_is_dirty=False)

    blueprint = load_or_create_blueprint()
    graph = Graph(blueprint)
    output = graph.clear()

    def upper_layered(c, r):
        return graph.upper_body_layer(
            graph.locomotion, lambda c2, r2: graph.slot(UPPER_BODY_SLOT, graph.locomotion, c2, r2), c, r)

    alive = lambda c, r: graph.slot("DefaultSlot", upper_layered, c, r)
    dead = lambda c, r: graph.sequence("A_Death01", c, r, loop=False)
    graph.connect(graph.blend_by_bool("bDead", dead, alive, DEATH_BLEND, 1, 0), "Pose", output, "Result")

    unreal.BlueprintEditorLibrary.compile_blueprint(blueprint)
    errors = [n.get_name() for n in graph.editor.list_nodes_with_errors()]
    if errors:
        raise RuntimeError("ABP_Protagonist compiled with errors on: " + ", ".join(errors))
    assets.save_loaded_asset(blueprint, only_if_is_dirty=False)
    unreal.log_warning("build_anim_blueprint: done")


main()

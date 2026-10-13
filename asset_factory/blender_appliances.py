"""Appliance authoring extension; exports and validation use the common canonical pipeline."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_generate as canonical

original_build = canonical.build


def build(spec):
    if spec["type"] not in ("washer", "fridge", "stove"):
        raise ValueError("Appliance generator requires an appliance specification")
    original_build(spec)
    dims = spec["dimensions"]
    w, h, d = (dims[key] / 1000 for key in ("width_mm", "height_mm", "depth_mm"))
    kind = spec["type"]
    for obj in canonical.OBJECTS:
        # Front panels must overlap the outside of the enclosure, never be hidden inside it.
        if obj.name.startswith("door_"):
            obj.location.y -= d * .03
        elif obj.name.startswith("handle_"):
            obj.location.y -= d * .048
        elif obj.name == "control" or obj.name == "oven":
            obj.location.y -= d * .018
        elif obj.name == "glass":
            obj.location.y -= d * .048
    if kind == "washer":
        canonical.sphere("door_frame", (w * .75, h * .54, d * .065), (0, h * .46, d * .505), "metal")
        canonical.box("control_display", (w * .27, h * .045, d * .018), (-w * .23, h * .9, d * .516), "glass", .005)
        canonical.sphere("control_knob", (w * .08, h * .057, d * .025), (w * .2, h * .9, d * .515), "linen")
    elif kind == "stove":
        canonical.box("oven_handle", (w * .65, h * .022, d * .045), (0, h * .69, d * .52), "metal", .006)
        for n in range(4):
            canonical.sphere(f"control_knob_{n}", (w * .065, h * .045, d * .025), ((n - 1.5) * w * .19, h * .9, d * .515), "linen")


canonical.build = build
if __name__ == "__main__":
    canonical.main()

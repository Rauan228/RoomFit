"""Finished appliance construction, including a mounted freezer separator."""
import sys, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import blender_interiors as I
import blender_generate as C


def build(spec):
    if spec["type"] not in ("fridge","washer","stove"):
        raise ValueError("Appliance extension requires an appliance")
    if spec["type"]=="stove":
        original_handle=I.handle
        depth=spec["dimensions"]["depth_mm"]/1000
        def mounted_handle(name,width,x,y,z):
            if name!="oven_handle":
                return original_handle(name,width,x,y,z)
            return I.tube(name,[(x-width/2,y,depth/2-.004),(x-width/2,y,z),(x+width/2,y,z),(x+width/2,y,depth/2-.004)],.0033,"metal",True)
        I.handle=mounted_handle
    I.build(spec)
    if spec["type"]=="fridge":
        # The separator sits on the enclosure in the gap between the two doors.
        # A front-side offset would otherwise leave this small part suspended.
        divider=next(obj for obj in C.OBJECTS if obj.name=="door_divider")
        divider.location.y=-spec["dimensions"]["depth_mm"]/1000*.50


if __name__=="__main__":
    spec=json.loads(Path(sys.argv[sys.argv.index("--")+1]).read_text(encoding="utf-8"))
    I.MATERIAL_PROFILE=spec["type"]
    C.material=I.material
    C.finish=I.finish
    C.build=build
    C.main()

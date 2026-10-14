"""Physical shade supports and bulb socket for the hollow fabric floor lamp."""
import sys, json, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import blender_interiors as I
import blender_generate as C


def build(spec):
    if spec["type"] != "lamp":
        raise ValueError("The floor-lamp extension only handles lamps")
    I.build(spec)
    w,d,h=(spec["dimensions"][key]/1000 for key in ("width_mm","depth_mm","height_mm"))
    pole=next(obj for obj in C.OBJECTS if obj.name=="stem")
    for vertex in pole.data.vertices:
        if vertex.co.z>0:
            vertex.co.z+=h*.05
    pole.data.update()
    for n in range(3):
        a=n*math.pi*2/3
        I.tube(f"shade_support_{n}",[(0,h*.805,0),(w*.482*math.cos(a),h*.805,d*.482*math.sin(a))],.0017,"metal",True)


if __name__=="__main__":
    spec=json.loads(Path(sys.argv[sys.argv.index("--")+1]).read_text(encoding="utf-8"))
    I.MATERIAL_PROFILE=spec["type"]
    C.material=I.material
    C.finish=I.finish
    C.build=build
    C.main()

"""Rug extension of the studio generator: knotted fringe carried by a woven heading.

Separate tassels would turn the plan outline into hundreds of teeth (beyond the
200-point contour limit of the asset schema). The warp ends are therefore woven
into a flat heading band; the tassels lie on it and stay inside its outline.
Keeping this in an extension leaves the versions of the other studio assets intact.
"""
import sys, json
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blender_generate as C
import blender_studio as S


def rug(w, d, h):
    fringe = .05
    bw = w - 2 * fringe
    pile = h - .002
    S.rbox("rug_field", (bw - .045, pile, d - .045), (0, pile / 2, 0), .002, "primary", seg=(1, 1, 1), feature="rug")
    loop, _ = S.rrect_outline(bw - .025, d - .025, .012, 4)
    S.sweep("rug_binding", [(p[0], h / 2 - .0003, p[1]) for p in loop], S.rrect_profile(.026, h - .0006, .0035, 2), up=(0, 1, 0), mat="linen_beige", closed=True, feature="rug")
    rng = np.random.default_rng(31)
    n = int((d - .06) / .022)
    for sx in (-1, 1):
        S.box(f"fringe_heading_{sx}", (fringe + .006, .0024, d - .06), (sx * (bw / 2 + fringe / 2 - .003), 0, 0), .0011, "linen_beige", feature="rug")
        for i in range(n):
            z = -d / 2 + .036 + i * (d - .072) / (n - 1)
            x0 = sx * (bw / 2 - .006)
            x1 = sx * (bw / 2 + fringe * rng.uniform(.8, .93))
            dz = rng.uniform(-.004, .004)
            S.sweep(f"fringe_{sx}_{i}", [(x0, .0042, z), ((x0 + x1) / 2, .0042, z + dz * .5), (x1, .0040, z + dz)], S.circle_profile(.0019, 6), up=(0, 1, 0), mat="linen_beige", collision=False, feature="seam")


if __name__ == "__main__":
    spec = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
    if spec["type"] != "rug":
        raise ValueError("The rug extension only handles rugs")
    S.SPEC = spec
    S.rug = rug
    C.build = S.build
    C.STUDIO = True
    C.main()

"""Deterministic, original, tileable PBR texture sets for the studio furniture generator.

Every texture is synthesized from seeded noise; no photograph or third-party image is
used. The output files are committed with the factory and hashed into every asset
version, so a changed texture can never reuse an approved cache entry.

Run:  api/.venv/Scripts/python.exe asset_factory/studio_textures.py
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent / "textures" / "studio-v1"


def periodic_noise(size, scale, seed, aspect=1.0, power=None):
    """Seamless band-limited noise. `scale` is the feature size in pixels along x,
    `aspect` stretches features along x (aspect > 1 gives fibres along x)."""
    h, w = size
    rng = np.random.default_rng(seed)
    white = rng.normal(size=(h, w))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    if power is None:
        sx, sy = scale * aspect, scale
        filt = np.exp(-((fx * sx) ** 2 + (fy * sy) ** 2) * 2 * np.pi ** 2)
    else:
        radius = np.sqrt((fx * aspect) ** 2 + fy ** 2) + 1 / max(h, w)
        filt = radius ** -power * np.exp(-(radius * scale) ** 2)
    field = np.fft.irfft2(np.fft.rfft2(white) * filt, s=(h, w))
    field -= field.mean()
    return field / (field.std() + 1e-9)


def fbm(size, base, seed, octaves=4, aspect=1.0):
    total = np.zeros(size)
    amplitude, norm = 1.0, 0.0
    for octave in range(octaves):
        total += periodic_noise(size, base / 2 ** octave, seed + octave * 101, aspect) * amplitude
        norm += amplitude
        amplitude *= .55
    return total / norm


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(height, strength):
    gy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * .5
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * .5
    nx, ny = -gx * strength, gy * strength  # OpenGL/glTF convention: +Y up in tangent space
    length = np.sqrt(nx * nx + ny * ny + 1)
    return np.stack((nx / length, ny / length, 1 / length), axis=2) * .5 + .5


def to_srgb(linear):
    linear = np.clip(linear, 0, 1)
    return np.where(linear <= .0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - .055)


def save(name, kind, array, quality=92):
    OUT.mkdir(parents=True, exist_ok=True)
    data = np.ascontiguousarray(np.clip(array, 0, 1))
    if kind == "albedo":
        data = to_srgb(data)
    image = Image.fromarray((data * 255 + .5).astype(np.uint8))
    path = OUT / f"{name}_{kind}.jpg"
    image.save(path, quality=quality, subsampling=0)
    return path.name


def wood_face(size=1024, seed=5):
    """Flat-sawn oak boards. x = along the grain, y = across. Tile = 0.9 m x 0.6 m."""
    h, w = size // 3 * 2, size
    y, x = np.mgrid[0:h, 0:w].astype(float)
    boards = 5
    board = np.floor(y / h * boards).astype(int)
    rng = np.random.default_rng(seed)
    tone = rng.normal(0, .05, boards)[board]
    across = (y / h * boards) % 1
    # Growth rings: uneven spacing, cathedral arches that open and close along the
    # board, and a slow lateral drift. No two boards share the same figure.
    drift = fbm((h, w), 260, seed + 1, 3, aspect=5.0) * 1.1
    spacing = fbm((h, w), 90, seed + 2, 2, aspect=3) * .6
    centre = rng.uniform(.25, .75, boards)[board]
    arch_len = rng.uniform(.6, 1.4, boards)[board]
    arch = np.abs(np.sin((x / w * 2 / arch_len + rng.uniform(0, 1, boards)[board]) * np.pi))
    dist = np.abs(across - centre)
    phase = dist * (7.5 + spacing) - arch * .9 * (1 - smoothstep(.0, .35, dist)) + drift + rng.uniform(0, 9, boards)[board]
    ring = phase % 1
    late = smoothstep(.35, .8, ring) * (1 - smoothstep(.88, 1.0, ring))
    streak = fbm((h, w), 1.6, seed + 7, 3, aspect=30) * .7 + fbm((h, w), 6, seed + 8, 2, aspect=18) * .5
    pores = np.clip(periodic_noise((h, w), 1.0, seed + 9, aspect=14) - 1.1, 0, None) * (.35 + late)
    mineral = fbm((h, w), 50, seed + 13, 3, aspect=8)
    rays = np.clip(periodic_noise((h, w), 1.6, seed + 17, aspect=.35) - 2.4, 0, None)
    level = .84 + tone - late * .15 + streak * .04 - pores * .12 + mineral * .05 + rays * .05
    glue = (np.abs(across - .5) > .4975).astype(float)
    level -= glue * .06
    warm = np.stack((level * (1 + late * .04), level * (1 - late * .005), level * (1 - late * .07)), axis=2)
    height = -late * .35 - pores * 1.2 + streak * .18 - glue * 1.2
    rough = np.clip(.8 + late * .08 + pores * .25 - mineral * .03, .55, 1)
    return warm, normal_from_height(height, 1.0), rough


def wood_end(size=512, seed=21):
    """End grain: arcs of growth rings and open pores. Tile = 0.2 m."""
    y, x = np.mgrid[0:size, 0:size].astype(float)
    warp = fbm((size, size), 40, seed, 3) * 1.5
    r = np.sqrt((x / size - .5) ** 2 + (y / size + 1.6) ** 2) * 60 + warp
    ring = r % 1
    late = smoothstep(.6, .92, ring)
    pores = np.clip(periodic_noise((size, size), 1.0, seed + 1) - 1.4, 0, None)
    level = .70 - late * .16 - pores * .14 + fbm((size, size), 30, seed + 2, 2) * .02
    rgb = np.stack((level * 1.02, level, level * .96), axis=2)
    height = -late * .5 - pores * 1.6
    return rgb, normal_from_height(height, 1.2), np.clip(.9 + pores * .2, .6, 1)


def weave(size, pitch, seed, slub=.0, contrast=.05, mottle=.025):
    """Plain weave with irregular yarn thickness. Tile is set by the material scale."""
    y, x = np.mgrid[0:size, 0:size].astype(float)
    rng = np.random.default_rng(seed)
    threads = size // pitch
    warp_thick = 1 + rng.normal(0, .12 + slub, threads)
    weft_thick = 1 + rng.normal(0, .12 + slub, threads)
    ix, iy = (x // pitch).astype(int) % threads, (y // pitch).astype(int) % threads
    fx, fy = (x % pitch) / pitch, (y % pitch) / pitch
    warp_profile = np.clip(1 - ((fx - .5) * 2 / np.clip(warp_thick[ix], .6, 1.5)) ** 2, 0, 1) ** .5
    weft_profile = np.clip(1 - ((fy - .5) * 2 / np.clip(weft_thick[iy], .6, 1.5)) ** 2, 0, 1) ** .5
    over = (ix + iy) % 2
    # The yarn crossing over rises at the cell centre and dips under its neighbours.
    arch_x = np.sin(fy * np.pi)
    arch_y = np.sin(fx * np.pi)
    height = np.where(over, warp_profile * (.6 + .4 * arch_x), weft_profile * (.6 + .4 * arch_y))
    if slub:
        slubs_x = np.clip(periodic_noise((size, size), 2.0, seed + 3, aspect=8) - 1.2, 0, None)
        slubs_y = np.clip(periodic_noise((size, size), 2.0, seed + 4, aspect=1 / 8) - 1.2, 0, None)
        height = height + (slubs_x * over + slubs_y * (1 - over)) * slub * 2
    fibre = periodic_noise((size, size), .8, seed + 5)
    mott = fbm((size, size), size / 6, seed + 6, 3)
    level = 1 - contrast + height * contrast + fibre * .012 + mott * mottle
    level = level / level.mean() * .92
    rough = np.clip(.92 + (1 - height) * .06 + fibre * .02, .75, 1)
    return np.repeat(level[:, :, None], 3, axis=2), normal_from_height(height * .9 + fibre * .05, 1.6), rough


def velvet(size=512, seed=31):
    """Fine upholstery velvet / chenille: soft pile with crushed areas, no visible grid."""
    pile = fbm((size, size), 2.2, seed, 2)
    crush = fbm((size, size), 70, seed + 1, 4)
    fibres = periodic_noise((size, size), 1.2, seed + 2, aspect=3)
    level = .9 + crush * .035 + pile * .02 + fibres * .01
    height = pile * .25 + fibres * .2 + crush * .4
    rough = np.clip(.9 + crush * .05, .75, 1)
    return np.repeat(level[:, :, None], 3, axis=2), normal_from_height(height, 1.3), rough


def knit(size=512, seed=41):
    """Chunky stockinette knit: vertical columns of V stitches, 10 x 12 per tile."""
    y, x = np.mgrid[0:size, 0:size].astype(float)
    cols, rows = 10, 12
    cw, ch = size / cols, size / rows
    height = np.zeros((size, size))
    for shift in (0, 1):  # neighbouring rows overlap like real loops
        s = (x % cw) / cw - .5
        t = ((y + shift * ch * .5) % ch) / ch - .5
        for side in (-1, 1):
            # An arm runs from the bottom centre to the upper outer corner of the cell.
            d = np.array((side * .42, -1.0)); d /= np.linalg.norm(d)
            px, py = s - side * .21, t
            along = px * d[0] + py * d[1]
            perp = -px * d[1] + py * d[0]
            lobe = np.clip(1 - (along / .56) ** 2 - (perp / .2) ** 2, 0, 1) ** .55
            height = np.maximum(height, lobe * (1 if shift == 0 else .0))
    yarn = periodic_noise((size, size), 1.3, seed, aspect=.6) * .07
    height = height + yarn
    occlusion = .58 + .42 * np.clip(height, 0, 1) ** .6
    mott = fbm((size, size), 60, seed + 1, 3) * .025
    level = occlusion * .98 + mott
    return np.repeat(level[:, :, None], 3, axis=2), normal_from_height(height * 5, 1.3), np.clip(.95 - height * .05, .8, 1)


def rug_pile(size=1024, seed=51):
    """Hand-woven wool rug, tile = 0.5 m: tonal diamond lattice, abrash bands, pile."""
    clumps = fbm((size, size), 3.0, seed, 2)
    tufts = np.clip(periodic_noise((size, size), 1.0, seed + 1), -2, 2)
    wave = fbm((size, size), 160, seed + 2, 3)
    y, x = np.mgrid[0:size, 0:size].astype(float) / size
    wob = wave * .012
    # Diamond lattice: two families of soft lines, 4 repeats per tile (12.5 cm).
    d1 = np.abs(((x + y + wob) * 4) % 1 - .5)
    d2 = np.abs(((x - y + wob) * 4) % 1 - .5)
    lines = np.exp(-(d1 / .035) ** 2) + np.exp(-(d2 / .035) ** 2)
    knots = np.exp(-((d1 - .5) ** 2 + (d2 - .5) ** 2) / .004)
    abrash = fbm((size, size), 300, seed + 3, 2, aspect=6) * .03
    level = .9 + clumps * .03 + tufts * .02 + abrash - np.clip(lines, 0, 1) * .14 - knots * .1
    height = clumps * .6 + tufts * .4 - np.clip(lines, 0, 1) * .5
    return np.repeat(level[:, :, None], 3, axis=2), normal_from_height(height, 1.4)[::2, ::2], np.clip(.97 + clumps * .02, .85, 1)


def orange_peel(size=256, seed=61, amount=.25):
    bumps = fbm((size, size), 5, seed, 3)
    return normal_from_height(bumps * amount, 1.0)


def brushed(size=256, seed=71):
    lines = periodic_noise((size, size), .7, seed, aspect=40)
    return normal_from_height(lines * .25, 1.0), np.clip(.92 + lines * .06, .7, 1)


def stone(size=1024, seed=81):
    """Light engineered quartz: fine speckles and a soft cloud. Tile = 0.6 m."""
    cloud = fbm((size, size), 80, seed, 4)
    grains = periodic_noise((size, size), .9, seed + 1)
    flecks = np.clip(grains - 2.2, 0, None) * .35 + np.clip(-grains - 2.4, 0, None) * .25
    level = .93 + cloud * .02 - flecks
    rgb = np.stack((level * 1.0, level * .99, level * .965), axis=2)
    return rgb, normal_from_height(flecks * .3, .6), np.clip(.95 + cloud * .03, .8, 1)


def stoneware(size=512, seed=91):
    cloud = fbm((size, size), 40, seed, 4)
    specks = np.clip(periodic_noise((size, size), .9, seed + 1) - 2.3, 0, None)
    level = .9 + cloud * .03 - specks * .25
    rgb = np.stack((level, level * .985, level * .96), axis=2)
    return rgb, normal_from_height(cloud * .3 + specks * .5, 1.0), np.clip(.95 - specks * .1, .7, 1)


def soil(size=256, seed=101):
    grains = fbm((size, size), 1.5, seed, 3)
    pebbles = np.clip(periodic_noise((size, size), 4, seed + 1) - 1.3, 0, None)
    level = .16 + grains * .035 + pebbles * .08
    rgb = np.stack((level * 1.15, level * .95, level * .78), axis=2)
    return rgb, normal_from_height(grains * 1.2 + pebbles * 2, 1.4), np.clip(.95 + grains * .03, .8, 1)


def leaf(seed=111):
    """Leaf space: x = base->tip, y = across the blade. Vein network and edge tint."""
    w, h = 512, 256
    y, x = np.mgrid[0:h, 0:w].astype(float)
    u, v = x / w, (y / h - .5) * 2
    mid = np.exp(-(v / .025) ** 2)
    veins = np.zeros_like(u)
    for k in range(9):
        offset = u - (.08 + k * .1) - np.abs(v) * .32
        veins = np.maximum(veins, np.exp(-(offset / .006) ** 2) * (np.abs(v) < .93) * (1 - np.abs(v) * .5))
    cells = fbm((h, w), 4, seed, 2) * .5
    tone = fbm((h, w), 60, seed + 1, 3)
    edge = smoothstep(.75, 1, np.abs(v))
    g = .13 + tone * .02 + cells * .012 + mid * .09 + veins * .035 + edge * .015 + u * .02
    rgb = np.stack((g * .42, g, g * .3), axis=2)
    height = mid * .8 + veins * .45 - cells * .05
    rough = np.clip(.5 - mid * .1 + cells * .04, .3, .8)
    return rgb, normal_from_height(height, 2.0), rough


def main():
    files = {}
    sets = {
        "oak": wood_face(),
        "endgrain": wood_end(),
        "upholstery": weave(512, 6, 7, slub=.02, contrast=.07, mottle=.02),
        "velvet": velvet(),
        "linen": weave(512, 5, 13, slub=.09, contrast=.06, mottle=.03),
        "knit": knit(),
        "rug": rug_pile(),
        "stone": stone(),
        "stoneware": stoneware(),
        "soil": soil(),
        "leaf": leaf(),
    }
    fabrics = {"upholstery", "velvet", "linen", "knit", "rug"}
    for name, (albedo, normal, rough) in sets.items():
        # Runtime budget: fabric relief at 256 px (weave stays ~3 px per yarn), wood at
        # 512 px; fabric roughness variation is low-frequency, so 128-256 px suffices.
        step = 2 if name in fabrics or name == "oak" else 1
        files[name] = {"albedo": save(name, "albedo", albedo), "normal": save(name, "normal", normal[::step, ::step], 92)}
        files[name]["roughness"] = save(name, "roughness", rough[::4, ::4] if name in fabrics else rough[::2, ::2])
    files["powder"] = {"normal": save("powder", "normal", orange_peel(), 95)}
    files["paint"] = {"normal": save("paint", "normal", orange_peel(256, 63, .08), 95)}
    bn, br = brushed()
    files["brushed"] = {"normal": save("brushed", "normal", bn, 95), "roughness": save("brushed", "roughness", br)}
    (OUT / "index.json").write_text(json.dumps({"generator": "asset_factory/studio_textures.py", "license": "CC0-1.0 (original procedural work by RoomFit Asset Factory)", "sets": files}, indent=2), encoding="utf-8")
    print(f"Wrote {sum(len(v) for v in files.values())} texture maps to {OUT}")


if __name__ == "__main__":
    main()

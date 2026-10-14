"""Deterministic, original floor PBR atlases. No reference photographs are redistributed."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]/"platform/public/assets/materials/floors/reference-v1"
size=1024
y,x=np.mgrid[:size,:size]/size
rng=np.random.default_rng(771)
noise=rng.normal(0,.005,(size,size))
for preset,color in {"oak":"b79d7c","light":"d3c9b7","walnut":"7b5b40","tile":"dfdfd7"}.items():
    base=np.array([int(color[i:i+2],16)/255 for i in (0,2,4)])
    if preset=="tile":
        seam=np.minimum(np.mod(x*4,1),np.mod(y*4,1))<.009
        level=1+noise*.6-seam*.08
        height=noise*.001-seam*.002
        roughness=.53+noise
    else:
        row=(y*8).astype(int)
        offsets=np.array([0,.31,.12,.47,.19,.04,.39,.23])[row]
        section=np.floor(x*2+offsets).astype(int)
        color_variants=np.array([[.0,-.01,.018],[.018,-.015,.009],[-.012,.012,-.014],[.009,.023,-.007],[-.019,.0,.009],[.01,-.019,.022],[.024,-.011,.001],[-.012,.018,-.005]])
        variation=color_variants[row,section]
        bent=y+.0007*np.sin(x*2*np.pi)+.00025*np.sin(x*14*np.pi)
        grain=.009*np.sin(bent*1536*np.pi+x*.8)+.007*np.sin(bent*602*np.pi)
        broad=.011*np.sin(bent*110*np.pi+x*1.9)+.009*np.sin(x*5+y*30)
        seam=(np.mod(y*8,1)<.005)|(np.mod(x*2+offsets,1)<.0025)
        level=1+variation+grain+broad+noise-seam*.15
        height=grain*.016+noise*.003-seam*.004
        roughness=.82+grain*.9+noise*.7
    rgb=np.clip(level[:,:,None]*base,0,1)
    gy,gx=np.gradient(height)
    nx,ny=-gx*size,-gy*size
    length=np.sqrt(nx*nx+ny*ny+1)
    normal=np.stack((nx/length*.5+.5,ny/length*.5+.5,1/length*.5+.5),axis=2)
    folder=ROOT/preset; folder.mkdir(parents=True,exist_ok=True)
    Image.fromarray((rgb*255).astype('uint8')).save(folder/'color.jpg',quality=92,subsampling=0)
    Image.fromarray((np.clip(normal,0,1)*255).astype('uint8')).save(folder/'normal.png',optimize=True)
    Image.fromarray((np.clip(roughness,0,1)*255).astype('uint8')).save(folder/'roughness.jpg',quality=90)
print("Four original floor PBR sets exported.")

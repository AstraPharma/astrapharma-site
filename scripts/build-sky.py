"""Build the atlas background sky from an equirectangular all-sky image.

The wide view used to come from Mellinger, which is hosted only at the
Strasbourg data centre. When that went dark in October 2026 the atlas had
nothing good to fall back on, so the wide view is now a map we host ourselves.

The source is the Gaia colour sky that ESA publishes as a 40000 by 20000
equirectangular image in galactic coordinates, under CC BY-SA 3.0 IGO:

  https://sci.esa.int/web/gaia/-/60196-gaia-s-sky-in-colour-equirectangular-projection

This reprojects it into HiPS tiles, which is the format the renderer reads.
Needs numpy, pillow and astropy-healpix. Run it as:

  python scripts/build-sky.py gaia40k.png public/sky/gaia 82

Order 4 is the last order worth building. The source is 32 arcsec per pixel and
order 4 tiles are 26, so anything beyond that would be inventing detail.
"""

import datetime
import math
import os
import sys
import time

import numpy as np
from PIL import Image
from astropy_healpix import healpix_to_lonlat

Image.MAX_IMAGE_PIXELS = None

TILE = 512
MAX_ORDER = 4


def load_source(path):
    im = Image.open(path).convert('RGB')
    print(f'  source {im.size[0]}x{im.size[1]}', flush=True)
    return np.asarray(im)


def sample(src, lon_deg, lat_deg):
    """Bilinear lookup in an equirectangular galactic map.

    Longitude increases to the left with l=0 at the centre, which is the
    convention ESA ships. Checked against the Magellanic Clouds: the LMC lands
    at l=280, the SMC at l=303, both where they belong.
    """
    height, width = src.shape[:2]
    xf = ((180.0 - lon_deg) / 360.0) % 1.0
    yf = (90.0 - lat_deg) / 180.0
    x = xf * width - 0.5
    y = np.clip(yf * height - 0.5, 0, height - 1)

    x_floor = np.floor(x)
    y_floor = np.floor(y)
    fx = (x - x_floor)[..., None].astype(np.float32)
    fy = (y - y_floor)[..., None].astype(np.float32)

    # Longitude wraps, latitude clamps at the poles.
    x0 = x_floor.astype(np.int64) % width
    x1 = (x0 + 1) % width
    y0 = y_floor.astype(np.int64)
    y1 = np.minimum(y0 + 1, height - 1)

    top = src[y0, x0].astype(np.float32) * (1 - fx) + src[y0, x1].astype(np.float32) * fx
    bottom = src[y1, x0].astype(np.float32) * (1 - fx) + src[y1, x1].astype(np.float32) * fx
    return top * (1 - fy) + bottom * fy


# How a tile raster sits on its HEALPix cell: dx runs with the row index and dy
# with the column. There are eight ways round this can go and the standard is
# easy to misread, so it was settled by generating all eight for cells ESA also
# publishes and scoring them against ESA's own tiles. The Magellanic Clouds,
# being compact and off centre, decide it outright: this one scores 0.96 where
# the nearest rival manages 0.59.
_T = (np.arange(TILE) + 0.5) / TILE
_COLS, _ROWS = np.meshgrid(_T, _T)


def make_tile(src, order, ipix):
    lon, lat = healpix_to_lonlat(ipix, 2 ** order, dx=_ROWS, dy=_COLS, order='nested')
    return np.clip(sample(src, lon.deg, lat.deg), 0, 255).astype(np.uint8)


def write_properties(out_dir, max_order):
    pixels = 12 * 4 ** max_order * TILE * TILE
    scale = math.sqrt(41252.96 / pixels)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    text = f"""creator_did          = ivo://astrapharma/P/gaia/dr2/colour
obs_title            = Gaia DR2 colour sky
obs_description      = All-sky colour map built from Gaia DR2 integrated fluxes in the Bp, G and Rp bands. Reprojected to HiPS from the equirectangular release published by ESA, and served from this site so the atlas does not depend on any outside data centre for its wide view.
obs_copyright        = ESA/Gaia/DPAC
obs_copyright_url    = https://sci.esa.int/web/gaia/-/60196-gaia-s-sky-in-colour-equirectangular-projection
obs_ack              = ESA/Gaia/DPAC
hips_copyright       = ESA/Gaia/DPAC, CC BY-SA 3.0 IGO
hips_license         = CC BY-SA 3.0 IGO
hips_creator         = AstraPharma
obs_regime           = Optical
dataproduct_type     = image
dataproduct_subtype  = color
hips_version         = 1.4
hips_release_date    = {stamp}
hips_frame           = galactic
hips_order           = {max_order}
hips_order_min       = 0
hips_tile_width      = {TILE}
hips_tile_format     = jpeg
hips_pixel_scale     = {scale:.4E}
hips_status          = public master unclonable
hips_initial_fov     = 240
"""
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'properties'), 'w', encoding='utf-8', newline='
') as fh:
        fh.write(text)
    print(f'  properties written, {scale * 3600:.1f} arcsec per pixel', flush=True)


def build(src_path, out_dir, quality):
    src = load_source(src_path)
    written = 0
    # Every order is sampled from the source rather than averaged down from the
    # order above it. It costs little, since orders 0 to 3 are only a thousand
    # tiles between them, and it keeps the child ordering out of the problem.
    for order in range(MAX_ORDER + 1):
        count = 12 * 4 ** order
        started = time.time()
        for ipix in range(count):
            folder = os.path.join(out_dir, f'Norder{order}', f'Dir{(ipix // 10000) * 10000}')
            os.makedirs(folder, exist_ok=True)
            Image.fromarray(make_tile(src, order, ipix)).save(
                os.path.join(folder, f'Npix{ipix}.jpg'), quality=quality, optimize=True
            )
            written += 1
        print(f'  order {order}: {count} tiles in {time.time() - started:.0f}s', flush=True)
    return written


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 1
    src_path, out_dir, quality = sys.argv[1], sys.argv[2], int(sys.argv[3])
    write_properties(out_dir, MAX_ORDER)
    written = build(src_path, out_dir, quality)
    total = sum(
        os.path.getsize(os.path.join(root, name))
        for root, _, names in os.walk(out_dir)
        for name in names
    )
    print(f'  {written} tiles, {total / 1048576:.1f} MB total')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

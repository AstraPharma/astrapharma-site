/* ---------------------------------------------------------------
   The layer that puts the photographs onto the sky.

   Everything about a captured field is drawn here from one shared
   projection: the picture itself once the frame is big enough on
   screen, its outline, a marker when it is too small to see, the
   hover and selection highlights, and the pointer hit testing. One
   projection for all of it keeps what you see and what you can click
   from ever drifting apart.

   Canvas 2D only does affine transforms, so a picture is mapped by
   its top-left / top-right / bottom-left corners and then clipped to
   the true four-corner outline. Over a frame a degree or two across
   the error is invisible, and the clip stops the widest mosaics from
   bleeding past their outline.
   --------------------------------------------------------------- */

const MIN_PHOTO_PX = 26; // below this a frame is drawn as a marker
const MIN_HIT_PX = 15; // pointer target floor for tiny frames
const MAX_SANE_PX = 40000; // guards against projection blow-ups at the edge

// Brand gold, matched to the CSS token. Kept literal because canvas cannot
// read custom properties.
const ACCENT = '#d9b26a';
const ACCENT_DIM = '#d9b26aa6';
const ACCENT_FILL = '#d9b26a2b';

export function createFieldsLayer({ canvas, container, aladin }) {
  const ctx = canvas.getContext('2d');
  const textures = new Map();
  let images = [];
  let showPhotos = true;
  let showFields = true;
  let hovered = null;
  let selected = null;
  let size = { w: 0, h: 0, dpr: 1 };

  /**
   * Matches the backing store to the container. Called before every draw
   * because the container can still be unmeasured when the layer is built —
   * a background tab lays out late, and the resize observer will not have
   * fired yet.
   */
  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (rect.width === size.w && rect.height === size.h && dpr === size.dpr) return false;
    size = { w: rect.width, h: rect.height, dpr };
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    return true;
  }

  /** Screen pixels per degree of sky, for sanity-checking projected sizes. */
  function scale() {
    try {
      const fov = aladin.getFov();
      const width = Array.isArray(fov) ? fov[0] : null;
      return width && size.w ? size.w / width : null;
    } catch {
      return null;
    }
  }

  /**
   * Projects a footprint to screen pixels, or null when it cannot be drawn.
   *
   * All-sky projections have a seam, and a frame lying across it comes back
   * with its corners on opposite edges of the map. Drawn naively that smears
   * the photograph right across the sky, so any quad that lands far larger
   * than its true angular size can account for is flagged and reduced to a
   * marker at its centre.
   */
  function project(image, pxPerDeg) {
    const footprint = image.sky?.footprint;
    if (!footprint) return null;

    const points = [];
    for (const [ra, dec] of footprint) {
      const p = aladin.world2pix(ra, dec);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      if (Math.abs(p[0]) > MAX_SANE_PX || Math.abs(p[1]) > MAX_SANE_PX) return null;
      points.push({ x: p[0], y: p[1] });
    }

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY);

    // Centre projected on its own, so a seam-crossing frame still has a
    // usable position for its marker.
    const middle = aladin.world2pix(image.sky.ra, image.sky.dec);
    const hasCentre = middle && Number.isFinite(middle[0]) && Number.isFinite(middle[1]);
    const cx = hasCentre ? middle[0] : (minX + maxX) / 2;
    const cy = hasCentre ? middle[1] : (minY + maxY) / 2;

    const extent = Math.max(image.sky.fovWidth || 0, image.sky.fovHeight || 0);
    const expected = pxPerDeg && extent ? extent * pxPerDeg : null;
    const wrapped = expected !== null && expected > 0 && span > expected * 3.5;

    if (wrapped) {
      if (!hasCentre) return null;
      if (cx < -60 || cx > size.w + 60 || cy < -60 || cy > size.h + 60) return null;
      return { points, width: 0, height: 0, span: 0, cx, cy, wrapped: true };
    }

    // Off screen entirely, with a margin so partly visible frames survive.
    if (maxX < -60 || minX > size.w + 60 || maxY < -60 || minY > size.h + 60) return null;

    return {
      points,
      width: maxX - minX,
      height: maxY - minY,
      span,
      cx,
      cy,
      wrapped: false,
    };
  }

  function texture(image) {
    let entry = textures.get(image.hash);
    if (entry) return entry;

    const src = image.thumbnails.regular ?? image.thumbnails.hd ?? image.thumbnails.card;
    if (!src) return null;

    entry = { img: new Image(), loaded: false, failed: false };
    entry.img.crossOrigin = 'anonymous';
    entry.img.decoding = 'async';
    entry.img.addEventListener('load', () => {
      entry.loaded = true;
      draw();
    });
    entry.img.addEventListener('error', () => {
      entry.failed = true;
    });
    entry.img.src = src;
    textures.set(image.hash, entry);
    return entry;
  }

  function traceQuad(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  function drawPhoto(image, geometry) {
    const entry = texture(image);
    if (!entry || entry.failed || !entry.loaded) return false;

    const [tl, tr, , bl] = geometry.points;
    const iw = entry.img.naturalWidth;
    const ih = entry.img.naturalHeight;
    if (!iw || !ih) return false;

    ctx.save();
    traceQuad(geometry.points);
    ctx.clip();
    ctx.transform(
      (tr.x - tl.x) / iw,
      (tr.y - tl.y) / iw,
      (bl.x - tl.x) / ih,
      (bl.y - tl.y) / ih,
      tl.x,
      tl.y,
    );
    ctx.globalAlpha = image.hash === hovered || image.hash === selected ? 1 : 0.94;
    ctx.drawImage(entry.img, 0, 0, iw, ih);
    ctx.restore();
    return true;
  }

  function drawMarker(geometry, active) {
    const r = active ? 7 : 5;
    ctx.save();
    ctx.translate(geometry.cx, geometry.cy);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = active ? '#ffffff' : ACCENT_FILL;
    ctx.fill();
    ctx.strokeStyle = active ? '#ffffff' : ACCENT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    resize();
    if (!size.w || !size.h) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const pxPerDeg = scale();
    const visible = [];
    for (const image of images) {
      const geometry = project(image, pxPerDeg);
      if (geometry) visible.push({ image, geometry });
    }
    // Largest first, so a tight crop nested inside a mosaic ends up on top.
    visible.sort((a, b) => b.geometry.span - a.geometry.span);

    for (const { image, geometry } of visible) {
      const active = image.hash === hovered || image.hash === selected;
      const bigEnough = !geometry.wrapped && geometry.span >= MIN_PHOTO_PX;

      if (showPhotos && bigEnough) drawPhoto(image, geometry);

      if (!showFields) continue;

      if (bigEnough) {
        ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
        traceQuad(geometry.points);
        ctx.strokeStyle = active ? '#ffffff' : ACCENT_DIM;
        ctx.lineWidth = active ? 2 : 1;
        ctx.stroke();
      } else {
        drawMarker(geometry, active);
      }
    }

    // Selection gets a soft outer glow so it stays findable while panning.
    const chosen = visible.find((v) => v.image.hash === selected && !v.geometry.wrapped);
    if (chosen && showFields) {
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.save();
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 16;
      traceQuad(chosen.geometry.points);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Ray casting, so it stays correct if a projection makes the quad concave. */
  function contains(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i];
      const b = points[j];
      const straddles = a.y > y !== b.y > y;
      if (straddles && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  /**
   * The frame under the pointer. Prefers the smallest frame containing the
   * point, so a tight crop inside a mosaic still wins, and falls back to
   * proximity for frames too small to click accurately.
   */
  function hitTest(x, y) {
    resize();
    const pxPerDeg = scale();
    let smallest = null;
    let nearest = null;

    for (const image of images) {
      const geometry = project(image, pxPerDeg);
      if (!geometry) continue;

      if (!geometry.wrapped && geometry.span >= MIN_HIT_PX && contains(geometry.points, x, y)) {
        const area = geometry.width * geometry.height;
        if (!smallest || area < smallest.area) smallest = { image, area };
        continue;
      }

      const distance = Math.hypot(geometry.cx - x, geometry.cy - y);
      if (distance <= MIN_HIT_PX && (!nearest || distance < nearest.distance)) {
        nearest = { image, distance };
      }
    }

    return smallest?.image ?? nearest?.image ?? null;
  }

  const observer = new ResizeObserver(() => draw());
  observer.observe(container);

  return {
    draw,
    hitTest,
    setImages(next) {
      images = next.filter((i) => i.sky?.footprint);
      draw();
    },
    setShowPhotos(value) {
      showPhotos = value;
      draw();
    },
    setShowFields(value) {
      showFields = value;
      draw();
    },
    setHovered(hash) {
      if (hovered === hash) return false;
      hovered = hash;
      draw();
      return true;
    },
    setSelected(hash) {
      if (selected === hash) return;
      selected = hash;
      draw();
    },
    destroy() {
      observer.disconnect();
    },
  };
}

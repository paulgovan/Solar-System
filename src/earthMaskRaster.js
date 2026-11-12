// Rasterizes Natural Earth land polygons into Earth's equirectangular land mask.
// DOM-free: runs in the mask worker (OffscreenCanvas) or, as a fallback, on the main
// thread. Output is RGBA bytes with row 0 = south, ready for a DataTexture.
//
// Channels: R = land (sharp), G = land blurred slightly (coastal shelf),
//           B = land blurred heavily (continental interior / distance from sea).

/** Decode a TopoJSON MultiPolygon/Polygon collection into arrays of rings of [lon, lat]. */
export function decodeTopology(topo, objectName) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ring = (indices) => {
    const pts = [];
    for (const i of indices) {
      const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
      pts.push(...(pts.length ? a.slice(1) : a));
    }
    return pts;
  };
  const polygons = [];
  for (const g of topo.objects[objectName].geometries) {
    if (g.type === 'Polygon') polygons.push(g.arcs.map(ring));
    else if (g.type === 'MultiPolygon') for (const p of g.arcs) polygons.push(p.map(ring));
  }
  return polygons;
}

function rasterize(polygons, width, makeCanvas) {
  const height = width / 2;
  const c = makeCanvas(width, height);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);
  g.fillStyle = '#fff';
  const X = (lon) => ((lon + 180) / 360) * width;
  const Y = (lat) => ((90 - lat) / 180) * height;
  // Rings that cross the antimeridian are unwrapped to continuous longitudes,
  // then drawn three times (shifted by ±360°) so both halves land on the map.
  const unwrap = (r) => {
    let off = 0;
    return r.map(([lon, lat], i) => {
      if (i) {
        const prev = r[i - 1][0];
        if (lon - prev > 180) off -= 360;
        else if (prev - lon > 180) off += 360;
      }
      return [lon + off, lat];
    });
  };
  for (const poly of polygons) {
    const rings = poly.map(unwrap);
    for (const shift of [-360, 0, 360]) {
      g.beginPath();
      for (const r of rings) {
        r.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon + shift), Y(lat)) : g.moveTo(X(lon + shift), Y(lat))));
        g.closePath();
      }
      g.fill('evenodd');
    }
  }
  return c;
}

/** Cheap, portable blur: downsample with smoothing, then scale back up. */
function blurred(src, factor, width, makeCanvas) {
  const sw = Math.max(8, Math.round(width / factor));
  const small = makeCanvas(sw, sw / 2);
  const sg = small.getContext('2d');
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(src, 0, 0, sw, sw / 2);
  const out = makeCanvas(width, width / 2);
  const og = out.getContext('2d');
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = 'high';
  og.drawImage(small, 0, 0, width, width / 2);
  return out;
}

/**
 * @param {object} topo         world-atlas land TopoJSON
 * @param {number} width        mask width (height = width / 2)
 * @param {(w: number, h: number) => HTMLCanvasElement|OffscreenCanvas} makeCanvas
 * @returns {Uint8Array} RGBA, width × width/2, bottom row first
 */
export function buildLandMask(topo, width, makeCanvas) {
  const polygons = decodeTopology(topo, 'land');
  const sharp = rasterize(polygons, width, makeCanvas);
  const shelf = blurred(sharp, 48, width, makeCanvas);
  const interior = blurred(sharp, 180, width, makeCanvas);
  const h = width / 2;
  const read = (cv) => cv.getContext('2d').getImageData(0, 0, width, h).data;
  const a = read(sharp), b = read(shelf), d = read(interior);
  const out = new Uint8Array(width * h * 4);
  for (let y = 0; y < h; y++) {
    const src = y * width * 4;
    const dst = (h - 1 - y) * width * 4; // flip: canvas rows run north → south
    for (let x = 0; x < width * 4; x += 4) {
      out[dst + x] = a[src + x];
      out[dst + x + 1] = b[src + x];
      out[dst + x + 2] = d[src + x];
      out[dst + x + 3] = 255;
    }
  }
  return out;
}

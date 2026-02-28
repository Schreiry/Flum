export function composeMatrix(out, offset, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cX = Math.cos(rx), sX = Math.sin(rx);
    const cY = Math.cos(ry), sY = Math.sin(ry);
    const cZ = Math.cos(rz), sZ = Math.sin(rz);

    // Three.js uses XYZ Euler order by default
    const ae = cX * cZ, af = cX * sZ, be = sX * cZ, bf = sX * sZ;

    const m11 = cY * cZ;
    const m21 = -cY * sZ;
    const m31 = sY;

    const m12 = cX * sZ + sX * sY * cZ;
    const m22 = cX * cZ - sX * sY * sZ;
    const m32 = -sX * cY;

    const m13 = sX * sZ - cX * sY * cZ;
    const m23 = sX * cZ + cX * sY * sZ;
    const m33 = cX * cY;

    out[offset + 0] = m11 * sx; out[offset + 1] = m12 * sx; out[offset + 2] = m13 * sx; out[offset + 3] = 0.0;
    out[offset + 4] = m21 * sy; out[offset + 5] = m22 * sy; out[offset + 6] = m23 * sy; out[offset + 7] = 0.0;
    out[offset + 8] = m31 * sz; out[offset + 9] = m32 * sz; out[offset + 10] = m33 * sz; out[offset + 11] = 0.0;
    out[offset + 12] = tx; out[offset + 13] = ty; out[offset + 14] = tz; out[offset + 15] = 1.0;
}

/**
 * Projection of the Swiss canton GeoJSON into SVG paths.
 *
 * Extracted from SwissMap so the Direction B coverage section can draw the
 * same geometry without a second copy of the maths. Pure functions — no React,
 * no DOM — so both callers stay free to render however they like.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/** KANTONSNUM → canton code and name, as the GeoJSON numbers them. */
export const CANTON_BY_NUMBER: Record<number, { abbr: string; name: string }> = {
  1: { abbr: "ZH", name: "Zürich" }, 2: { abbr: "BE", name: "Bern" },
  3: { abbr: "LU", name: "Luzern" }, 4: { abbr: "UR", name: "Uri" },
  5: { abbr: "SZ", name: "Schwyz" }, 6: { abbr: "OW", name: "Obwalden" },
  7: { abbr: "NW", name: "Nidwalden" }, 8: { abbr: "GL", name: "Glarus" },
  9: { abbr: "ZG", name: "Zug" }, 10: { abbr: "FR", name: "Fribourg" },
  11: { abbr: "SO", name: "Solothurn" }, 12: { abbr: "BS", name: "Basel-Stadt" },
  13: { abbr: "BL", name: "Basel-Landschaft" }, 14: { abbr: "SH", name: "Schaffhausen" },
  15: { abbr: "AR", name: "Appenzell Ausserrhoden" }, 16: { abbr: "AI", name: "Appenzell Innerrhoden" },
  17: { abbr: "SG", name: "St. Gallen" }, 18: { abbr: "GR", name: "Graubünden" },
  19: { abbr: "AG", name: "Aargau" }, 20: { abbr: "TG", name: "Thurgau" },
  21: { abbr: "TI", name: "Ticino" }, 22: { abbr: "VD", name: "Vaud" },
  23: { abbr: "VS", name: "Valais" }, 24: { abbr: "NE", name: "Neuchâtel" },
  25: { abbr: "GE", name: "Genève" }, 26: { abbr: "JU", name: "Jura" },
};

export interface ProjectedCanton {
  uniqueId: string;
  abbr: string;
  name: string;
  path: string;
}

export function traverseCoordinates(
  coords: unknown[],
  callback: (coord: number[]) => void,
): void {
  if (typeof (coords as number[])[0] === "number") {
    callback(coords as number[]);
  } else {
    (coords as unknown[][]).forEach((c) => traverseCoordinates(c, callback));
  }
}

export function getBounds(features: AnyRecord[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of features) {
    traverseCoordinates(feature.geometry.coordinates, ([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  }
  return { minX, minY, maxX, maxY };
}

function ringToPath(
  ring: number[][],
  scale: number,
  offsetX: number,
  offsetY: number,
): string {
  if (!ring?.length) return "";
  return (
    ring
      .map((coord, i) => {
        const [x, y] = coord;
        const sx = x * scale + offsetX;
        // SVG y grows downwards; the projection's does not.
        const sy = -(y * scale) + offsetY;
        return i === 0 ? `M${sx},${sy}` : `L${sx},${sy}`;
      })
      .join("") + "Z"
  );
}

export function geometryToPath(
  geometry: AnyRecord,
  scale: number,
  offsetX: number,
  offsetY: number,
): string {
  if (!geometry) return "";
  if (geometry.type === "Polygon") {
    return geometry.coordinates
      .map((ring: number[][]) => ringToPath(ring, scale, offsetX, offsetY))
      .join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => ringToPath(ring, scale, offsetX, offsetY)).join(" "),
      )
      .join(" ");
  }
  return "";
}

/**
 * Fit every canton into a `width`-wide viewBox and return the SVG paths plus
 * the viewBox string to draw them in.
 */
export function projectCantons(
  features: AnyRecord[],
  width = 960,
  margin = 40,
): { cantons: ProjectedCanton[]; viewBox: string } {
  const bounds = getBounds(features);
  const geoWidth = bounds.maxX - bounds.minX;
  const geoHeight = bounds.maxY - bounds.minY;
  const height = (geoHeight / geoWidth) * width + 2 * margin;
  const scale = Math.min(
    (width - 2 * margin) / geoWidth,
    (height - 2 * margin) / geoHeight,
  );
  const offsetX = margin - bounds.minX * scale;
  const offsetY = height - margin + bounds.minY * scale;

  const cantons = features.map((feature: AnyRecord, index: number) => {
    const info = CANTON_BY_NUMBER[feature.properties.KANTONSNUM];
    return {
      uniqueId: `${feature.properties.KANTONSNUM}-${index}`,
      abbr: info?.abbr || "XX",
      name: info?.name || feature.properties.NAME,
      path: geometryToPath(feature.geometry, scale, offsetX, offsetY),
    };
  });

  return { cantons, viewBox: `0 0 ${width} ${height}` };
}

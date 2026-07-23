import type { Terrain, Tile } from "../types";

/**
 * Terrain rules — one place that decides how obstacles gate building and
 * movement, so roads, pipe, rigs, and drilling all agree.
 *
 *   ground / scrub — open: build, drive, drill freely.
 *   creek          — needs a bridge: road/pipe may cross (at a premium); a rig
 *                    may only cross a bridged (roaded) creek; no drilling.
 *   water / rock    — hard obstacle: nothing builds or crosses; no drilling.
 */

export function isOpen(t: Terrain): boolean {
  return t === "ground" || t === "scrub";
}

/** Hard obstacle for roads and pipelines (water, rock). */
export function blocksBuild(t: Terrain): boolean {
  return t === "water" || t === "rock";
}

/** Creek tiles carry a bridge premium when roaded/piped. */
export function isBridgeTerrain(t: Terrain): boolean {
  return t === "creek";
}

/** A rig may enter open ground, or any tile bridged by a road. */
export function rigCanEnter(tile: Tile): boolean {
  return isOpen(tile.terrain) || tile.hasRoad;
}

/** Wells can only be spudded on open ground. */
export function canDrill(tile: Tile): boolean {
  return isOpen(tile.terrain) && !tile.drilled;
}

/** Human-readable terrain label for inspect tooltips. */
export function terrainLabel(t: Terrain): string {
  switch (t) {
    case "ground":
      return "open ground";
    case "scrub":
      return "scrub";
    case "water":
      return "water — impassable";
    case "creek":
      return "creek — bridge to cross";
    case "rock":
      return "rock ridge — impassable";
  }
}

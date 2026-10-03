import {
  BeliefMapSchema,
  type BeliefMap,
  type Domain,
  type TemporalLayer,
} from "./belief-types";

export const DOMAIN_ORDER: readonly Domain[] = [
  "self",
  "relationship",
  "life",
  "career",
  "money",
  "body",
  "learning",
  "uncertainty",
  "creation",
  "meaning",
];

export const HEIGHT_BY_TIME: Record<TemporalLayer, number> = {
  past: -6,
  current: 0,
  emerging: 6,
};

export const MAX_DEPTH = 4;

const TWO_PI = Math.PI * 2;
export const SECTOR_WIDTH = TWO_PI / DOMAIN_ORDER.length;

/** Distance from the centre of the ring that holds nodes of this depth. */
export function ringRadius(depth: number): number {
  return 3.2 + depth * 3.65;
}

/** Angle (radians, in the x/z plane) of the centre of a domain's sector. */
export function domainAngle(domain: Domain): number {
  return -Math.PI / 2 + DOMAIN_ORDER.indexOf(domain) * SECTOR_WIDTH;
}

/**
 * Places nodes in a deterministic semantic layout.
 *
 * - radial distance encodes depth (core -> rules -> strategies)
 * - angular sector encodes the primary life domain
 * - height encodes past/current/emerging
 *
 * The function does not mutate the input and does not use a physics simulation,
 * so the same valid map always receives the same coordinates.
 */
export function layoutBeliefMap(map: BeliefMap): BeliefMap {
  const validated = BeliefMapSchema.parse(map);

  const nodes = validated.nodes.map((node) => {
    // Stable jitter prevents nodes in one semantic slot from sitting exactly
    // on top of each other, without making their location drift between loads.
    const angleJitter = signedUnitHash(`${node.id}:angle`) * SECTOR_WIDTH * 0.34;
    const radiusJitter = signedUnitHash(`${node.id}:radius`) * 0.55;
    const heightJitter = signedUnitHash(`${node.id}:height`) * 0.42;

    const radius = ringRadius(node.depth) + radiusJitter;
    const angle = domainAngle(node.primaryDomain) + angleJitter;

    return {
      ...node,
      position: {
        x: roundCoordinate(Math.cos(angle) * radius),
        y: roundCoordinate(HEIGHT_BY_TIME[node.temporalLayer] + heightJitter),
        z: roundCoordinate(Math.sin(angle) * radius),
      },
    };
  });

  return BeliefMapSchema.parse({ ...validated, nodes });
}

function signedUnitHash(value: string): number {
  return (fnv1a(value) / 0xffffffff) * 2 - 1;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

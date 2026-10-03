import * as THREE from "three";

import type { BeliefNode, Confidence } from "../../lib/belief-types";

export const LABEL_LIMIT = 9;

export function positionOf(node: BeliefNode): THREE.Vector3 {
  return new THREE.Vector3(node.position?.x ?? 0, node.position?.y ?? 0, node.position?.z ?? 0);
}

/** Core sphere radius: impact sets the size, the two inner rings get a little extra weight. */
export function orbRadius(node: BeliefNode): number {
  return 0.3 + node.impact * 0.075 + (node.depth <= 1 ? 0.14 : 0);
}

export const GLOW_OPACITY: Record<Confidence, number> = {
  high: 0.62,
  medium: 0.42,
  low: 0.26,
};

/** Inferred (I) or hypothetical bridge (G) content that no direct quote backs yet. */
export function isHypothesis(node: BeliefNode): boolean {
  return node.provenance.every((item) => item === "I" || item === "G");
}

export function safeLabel(node: BeliefNode, limit = LABEL_LIMIT): string {
  if (node.sensitive) return "敏感信念";
  const characters = Array.from(node.label);
  return characters.length > limit ? `${characters.slice(0, limit).join("")}…` : node.label;
}

/** Points along a gentle arc between two nodes, lifted so relations do not cut through the floor. */
export function arcPoints(from: THREE.Vector3, to: THREE.Vector3, segments = 28): THREE.Vector3[] {
  const middle = from.clone().add(to).multiplyScalar(0.5);
  const distance = from.distanceTo(to);
  const control = new THREE.Vector3(middle.x * 0.86, middle.y + distance * 0.17, middle.z * 0.86);
  return new THREE.QuadraticBezierCurve3(from, control, to).getPoints(segments);
}

export function circlePoints(radius: number, segments = 96, y = 0): THREE.Vector3[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  });
}

/** Soft round sprite used for star glows and the floor light. */
export function createGlowTexture(size = 128): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.45, "rgba(255,255,255,0.14)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

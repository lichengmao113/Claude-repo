"use client";

/* eslint-disable react/no-unknown-property -- React Three Fiber renders Three.js objects, not DOM nodes. */

import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";

import type { BeliefEdge } from "../../lib/belief-types";
import { EDGE_STYLE } from "../../lib/belief-theme";
import { arcPoints } from "./scene-utils";

type ArcTone = "focus" | "normal" | "dim";

const TONE: Record<ArcTone, { width: number; opacity: number }> = {
  focus: { width: 2.4, opacity: 0.95 },
  normal: { width: 1.15, opacity: 0.4 },
  dim: { width: 0.8, opacity: 0.07 },
};

interface RelationArcsProps {
  edges: BeliefEdge[];
  positions: Map<string, THREE.Vector3>;
  /** Relations touching this node are highlighted and every other one fades. */
  focusId?: string;
}

/** Curved relations. Colour follows the relation kind and brightens toward the target node. */
export function RelationArcs({ edges, positions, focusId }: RelationArcsProps) {
  // Geometry depends on the layout only; hovering changes width and opacity, never the points.
  const arcs = useMemo(
    () =>
      edges.flatMap((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        if (!from || !to) return [];
        const points = arcPoints(from, to);
        const base = new THREE.Color(EDGE_STYLE[edge.kind].color);
        const tail = base.clone().multiplyScalar(0.35);
        const colors = points.map((_, index) => tail.clone().lerp(base, index / (points.length - 1)));
        return [{ edge, points, colors }];
      }),
    [edges, positions],
  );

  const toneOf = (edge: BeliefEdge): ArcTone =>
    !focusId ? "normal" : edge.source === focusId || edge.target === focusId ? "focus" : "dim";

  return (
    <group>
      {arcs.map(({ edge, points, colors }) => {
        const tone = toneOf(edge);
        return (
          <Line
            key={edge.id}
            points={points}
            vertexColors={colors}
            lineWidth={TONE[tone].width}
            dashed={Boolean(EDGE_STYLE[edge.kind].dashed)}
            dashSize={0.45}
            gapSize={0.3}
            transparent
            opacity={TONE[tone].opacity}
            depthWrite={false}
            renderOrder={tone === "focus" ? 2 : 0}
            raycast={() => null}
          />
        );
      })}
    </group>
  );
}

/** Thin plumb lines from each orb to the floor, so height reads as time at a glance. */
export function PlumbLines({ positions, dimmed }: { positions: THREE.Vector3[]; dimmed: boolean }) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (const position of positions) {
      if (Math.abs(position.y) < 0.6) continue;
      points.push(position, new THREE.Vector3(position.x, 0, position.z));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color="#9fb7d6" transparent opacity={dimmed ? 0.05 : 0.16} depthWrite={false} />
    </lineSegments>
  );
}

/** Dashed preview while choosing the second end of a new relation. */
export function LinkPreview({ from, to }: { from: THREE.Vector3; to: THREE.Vector3 }) {
  const points = useMemo(() => arcPoints(from, to), [from, to]);
  return (
    <Line points={points} color="#f2c46d" lineWidth={2} dashed dashSize={0.35} gapSize={0.22} transparent opacity={0.9} depthWrite={false} raycast={() => null} />
  );
}

"use client";

/* eslint-disable react/no-unknown-property -- React Three Fiber renders Three.js objects, not DOM nodes. */

import { useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, Line } from "@react-three/drei";
import * as THREE from "three";

import type { BeliefNode } from "../../lib/belief-types";
import { KIND_STYLE } from "../../lib/belief-theme";
import { GLOW_OPACITY, circlePoints, isHypothesis, orbRadius, positionOf, safeLabel } from "./scene-utils";

export type OrbEmphasis = "focus" | "normal" | "dim";

interface BeliefOrbProps {
  node: BeliefNode;
  emphasis: OrbEmphasis;
  selected: boolean;
  hovered: boolean;
  linkSource: boolean;
  showLabel: boolean;
  glowTexture: THREE.Texture;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onHover: (id?: string) => void;
}

function SelectionHalo({ radius, color, reducedMotion }: { radius: number; color: string; reducedMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ring.current || reducedMotion) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.07;
    ring.current.scale.setScalar(pulse);
    state.invalidate();
  });
  return (
    <Billboard>
      <mesh ref={ring} raycast={() => null}>
        <ringGeometry args={[radius * 1.75, radius * 1.9, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/** One belief: a lit core, a soft glow whose strength follows confidence, and an optional label. */
export function BeliefOrb({
  node,
  emphasis,
  selected,
  hovered,
  linkSource,
  showLabel,
  glowTexture,
  reducedMotion,
  onSelect,
  onHover,
}: BeliefOrbProps) {
  const color = KIND_STYLE[node.kind].color;
  const radius = orbRadius(node) * (hovered && !selected ? 1.12 : 1);
  const dim = emphasis === "dim";
  const hypothesis = isHypothesis(node);
  const verified = node.provenance.includes("U0");
  const glow = GLOW_OPACITY[node.confidence] * (verified ? 1.2 : 1) * (dim ? 0.22 : emphasis === "focus" ? 1.35 : 1);
  const hypothesisRing = useMemo(() => circlePoints(orbRadius(node) * 1.45, 48), [node]);

  return (
    <group position={positionOf(node)}>
      {/* Generous invisible hit area so small orbs are still easy to click. */}
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(node.id);
        }}
        onPointerOut={() => onHover(undefined)}
      >
        <sphereGeometry args={[Math.max(radius * 2, 0.85), 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <mesh raycast={() => null}>
        <sphereGeometry args={[radius, 32, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emphasis === "focus" ? 0.95 : dim ? 0.12 : 0.5}
          roughness={0.32}
          metalness={0.08}
          transparent
          opacity={dim ? 0.28 : node.status === "candidate" ? 0.86 : 1}
          depthWrite={!dim}
        />
      </mesh>

      <sprite scale={radius * (emphasis === "focus" ? 8 : 6.2)} raycast={() => null}>
        <spriteMaterial map={glowTexture} color={color} transparent opacity={glow} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>

      {hypothesis ? (
        <Billboard>
          <Line points={hypothesisRing} color={color} lineWidth={1} dashed dashSize={0.16} gapSize={0.12} transparent opacity={dim ? 0.2 : 0.75} depthWrite={false} raycast={() => null} />
        </Billboard>
      ) : null}

      {selected || linkSource ? (
        <SelectionHalo radius={orbRadius(node)} color={linkSource ? "#f2c46d" : "#f4f0e8"} reducedMotion={reducedMotion} />
      ) : null}

      {showLabel ? (
        <Html center position={[0, radius + 0.62, 0]} zIndexRange={[3, 0]}>
          <button
            type="button"
            className={`orb-label${selected ? " selected" : ""}${dim ? " dim" : ""}`}
            style={{ "--kind-color": color } as CSSProperties}
            onClick={() => onSelect(node.id)}
            onPointerEnter={() => onHover(node.id)}
            onPointerLeave={() => onHover(undefined)}
          >
            {safeLabel(node, selected ? 22 : undefined)}
            {selected ? <small>{KIND_STYLE[node.kind].label}</small> : null}
          </button>
        </Html>
      ) : null}
    </group>
  );
}

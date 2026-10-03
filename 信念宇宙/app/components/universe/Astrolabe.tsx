"use client";

/* eslint-disable react/no-unknown-property -- React Three Fiber renders Three.js objects, not DOM nodes. */

import { useEffect, useMemo, type CSSProperties } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import type { Domain, TemporalLayer } from "../../lib/belief-types";
import { DEPTH_LABELS, DOMAIN_STYLE, TIME_LABELS } from "../../lib/belief-theme";
import {
  DOMAIN_ORDER,
  HEIGHT_BY_TIME,
  MAX_DEPTH,
  SECTOR_WIDTH,
  domainAngle,
  ringRadius,
} from "../../lib/layout";
import { circlePoints, seededRandom } from "./scene-utils";

const OUTER = ringRadius(MAX_DEPTH);
/** The ring labels run along this spoke, between two sparse sectors on the near side. */
const RING_LABEL_ANGLE = domainAngle("money") + SECTOR_WIDTH / 2;
/** The time axis stands on the left of the default view. */
const TIME_AXIS_ANGLE = Math.PI;

function segmentsGeometry(points: THREE.Vector3[]) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeBoundingSphere();
  return geometry;
}

function loopAsSegments(loop: THREE.Vector3[]) {
  const pairs: THREE.Vector3[] = [];
  for (let index = 0; index < loop.length - 1; index += 1) pairs.push(loop[index], loop[index + 1]);
  return pairs;
}

function polar(angle: number, radius: number, y = 0) {
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function Starfield() {
  const geometry = useMemo(() => {
    const random = seededRandom(0x5e7a11);
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cool = new THREE.Color("#9cc4ff");
    const warm = new THREE.Color("#e6d4ff");
    for (let index = 0; index < count; index += 1) {
      const radius = 48 + random() * 60;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(random() * 2 - 1);
      const offset = index * 3;
      positions[offset] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[offset + 1] = Math.cos(phi) * radius * 0.7;
      positions[offset + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      const color = cool.clone().lerp(warm, random()).multiplyScalar(0.55 + random() * 0.45);
      colors.set([color.r, color.g, color.b], offset);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return next;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} raycast={() => null}>
      <pointsMaterial size={0.16} sizeAttenuation vertexColors transparent opacity={0.75} depthWrite={false} fog={false} />
    </points>
  );
}

interface AstrolabeProps {
  domainCounts: Map<Domain, number>;
  glowTexture: THREE.Texture;
}

/**
 * The floor of the universe: depth rings, domain sectors and the three time layers.
 * It draws the same coordinates `layoutBeliefMap` uses, so what you read here is where nodes land.
 */
export function Astrolabe({ domainCounts, glowTexture }: AstrolabeProps) {
  const { rings, spokes, timeRings } = useMemo(() => {
    const ringPoints = Array.from({ length: MAX_DEPTH + 1 }, (_, depth) =>
      loopAsSegments(circlePoints(ringRadius(depth), 128)),
    ).flat();

    const spokePoints: THREE.Vector3[] = [];
    DOMAIN_ORDER.forEach((domain) => {
      const boundary = domainAngle(domain) - SECTOR_WIDTH / 2;
      spokePoints.push(polar(boundary, ringRadius(0) - 1.2), polar(boundary, OUTER + 1.4));
    });

    const timePoints: THREE.Vector3[] = [
      ...loopAsSegments(circlePoints(OUTER + 0.9, 128, HEIGHT_BY_TIME.past)),
      ...loopAsSegments(circlePoints(OUTER + 0.9, 128, HEIGHT_BY_TIME.emerging)),
      polar(TIME_AXIS_ANGLE, OUTER + 0.9, HEIGHT_BY_TIME.past - 1),
      polar(TIME_AXIS_ANGLE, OUTER + 0.9, HEIGHT_BY_TIME.emerging + 1),
    ];

    return {
      rings: segmentsGeometry(ringPoints),
      spokes: segmentsGeometry(spokePoints),
      timeRings: segmentsGeometry(timePoints),
    };
  }, []);

  useEffect(
    () => () => {
      rings.dispose();
      spokes.dispose();
      timeRings.dispose();
    },
    [rings, spokes, timeRings],
  );

  return (
    <group>
      <Starfield />

      <mesh rotation-x={-Math.PI / 2} position-y={-0.04} raycast={() => null}>
        <planeGeometry args={[(OUTER + 7) * 2, (OUTER + 7) * 2]} />
        <meshBasicMaterial map={glowTexture} color="#1d4a5a" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03} raycast={() => null}>
        <planeGeometry args={[ringRadius(1) * 2.4, ringRadius(1) * 2.4]} />
        <meshBasicMaterial map={glowTexture} color="#5b4a2a" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      <lineSegments geometry={rings} raycast={() => null}>
        <lineBasicMaterial color="#7fa4bd" transparent opacity={0.22} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={spokes} raycast={() => null}>
        <lineBasicMaterial color="#7fa4bd" transparent opacity={0.09} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={timeRings} raycast={() => null}>
        <lineBasicMaterial color="#9c8fe0" transparent opacity={0.1} depthWrite={false} />
      </lineSegments>

      {DEPTH_LABELS.map((label, depth) => (
        <Html key={label} center position={polar(RING_LABEL_ANGLE, ringRadius(depth), 0.05)} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <span className="astro-ring-label">{label}</span>
        </Html>
      ))}

      {DOMAIN_ORDER.map((domain) => {
        const count = domainCounts.get(domain) ?? 0;
        return (
          <Html key={domain} center position={polar(domainAngle(domain), OUTER + 3, 0)} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
            <span
              className={`astro-domain${count ? "" : " empty"}`}
              style={{ "--domain-color": DOMAIN_STYLE[domain].color } as CSSProperties}
            >
              {DOMAIN_STYLE[domain].label}
              <small>{count}</small>
            </span>
          </Html>
        );
      })}

      {(Object.keys(HEIGHT_BY_TIME) as TemporalLayer[]).map((layer) => (
        <Html key={layer} center position={polar(TIME_AXIS_ANGLE, OUTER + 2.6, HEIGHT_BY_TIME[layer])} zIndexRange={[2, 0]} style={{ pointerEvents: "none" }}>
          <span className={`astro-time ${layer}`}>{TIME_LABELS[layer]}</span>
        </Html>
      ))}
    </group>
  );
}

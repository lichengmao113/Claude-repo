"use client";

/* eslint-disable react/no-unknown-property -- React Three Fiber renders Three.js objects, not DOM nodes. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { BeliefEdge, BeliefNode, Domain } from "../lib/belief-types";
import { MAX_DEPTH, ringRadius } from "../lib/layout";
import { Astrolabe } from "./universe/Astrolabe";
import { BeliefOrb, type OrbEmphasis } from "./universe/BeliefOrb";
import { CameraRig, type OrbitControlsHandle } from "./universe/CameraRig";
import { LinkPreview, PlumbLines, RelationArcs } from "./universe/RelationArcs";
import { createGlowTexture, positionOf } from "./universe/scene-utils";

export type LabelMode = "core" | "all";

export interface BeliefSceneProps {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Click on empty space. */
  onBackgroundClick: () => void;
  focusMode: "all" | "neighbors";
  labelMode: LabelMode;
  reducedMotion: boolean;
  /** While set, the next clicked node becomes the other end of a new relation. */
  linkSourceId?: string;
  resetToken: number;
}

/** Overview radius: the outer ring plus room for the domain names around it. */
const EXTENT = ringRadius(MAX_DEPTH) + 3.4;

function BeliefUniverse({
  nodes,
  edges,
  selectedId,
  onSelect,
  focusMode,
  labelMode,
  reducedMotion,
  linkSourceId,
  resetToken,
}: Omit<BeliefSceneProps, "onBackgroundClick">) {
  const [hoveredId, setHoveredId] = useState<string>();
  const controlsRef = useRef<OrbitControlsHandle>(null);
  const glowTexture = useMemo(() => createGlowTexture(), []);
  useEffect(() => () => glowTexture.dispose(), [glowTexture]);

  useEffect(() => {
    document.body.style.cursor = hoveredId ? (linkSourceId ? "crosshair" : "pointer") : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hoveredId, linkSourceId]);

  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const activeId = selectedId && nodeIds.has(selectedId) ? selectedId : undefined;

  const neighborIds = useMemo(() => {
    const ids = new Set<string>();
    if (!activeId) return ids;
    ids.add(activeId);
    for (const edge of edges) {
      if (edge.source === activeId) ids.add(edge.target);
      if (edge.target === activeId) ids.add(edge.source);
    }
    return ids;
  }, [activeId, edges]);

  const shownNodes = useMemo(
    () => (focusMode === "neighbors" && activeId ? nodes.filter((node) => neighborIds.has(node.id)) : nodes),
    [activeId, focusMode, neighborIds, nodes],
  );
  const shownEdges = useMemo(() => {
    const shown = new Set(shownNodes.map((node) => node.id));
    return edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target));
  }, [edges, shownNodes]);

  const positions = useMemo(() => new Map(shownNodes.map((node) => [node.id, positionOf(node)])), [shownNodes]);
  const plumbPositions = useMemo(() => [...positions.values()], [positions]);

  const domainCounts = useMemo(() => {
    const counts = new Map<Domain, number>();
    for (const node of nodes) counts.set(node.primaryDomain, (counts.get(node.primaryDomain) ?? 0) + 1);
    return counts;
  }, [nodes]);

  const selectedNode = activeId ? nodes.find((node) => node.id === activeId) : undefined;
  const focusKey = selectedNode?.position
    ? `${selectedNode.position.x},${selectedNode.position.y},${selectedNode.position.z}`
    : undefined;

  const linkFrom = linkSourceId ? positions.get(linkSourceId) : undefined;
  const linkTo = linkSourceId && hoveredId && hoveredId !== linkSourceId ? positions.get(hoveredId) : undefined;
  // While choosing the other end of a relation every node stays bright and findable.
  const dimAround = linkSourceId ? undefined : activeId;

  return (
    <>
      <fog attach="fog" args={["#060a14", 60, 130]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#cfe2ff", "#1a1630", 0.65]} />
      <directionalLight position={[10, 18, 12]} intensity={1.1} color="#eef4ff" />
      <pointLight position={[0, 4, 0]} intensity={30} distance={22} color="#f2c46d" />

      <Astrolabe domainCounts={domainCounts} glowTexture={glowTexture} />
      <PlumbLines positions={plumbPositions} dimmed={Boolean(dimAround)} />
      <RelationArcs edges={shownEdges} positions={positions} focusId={dimAround ?? hoveredId} />
      {linkFrom && linkTo ? <LinkPreview from={linkFrom} to={linkTo} /> : null}

      {shownNodes.map((node) => {
        const selected = node.id === activeId;
        const hovered = node.id === hoveredId;
        const emphasis: OrbEmphasis =
          selected || hovered || node.id === linkSourceId
            ? "focus"
            : dimAround && !neighborIds.has(node.id)
              ? "dim"
              : "normal";
        const showLabel =
          labelMode === "all" ||
          selected ||
          hovered ||
          node.id === linkSourceId ||
          // "敏感信念" placeholders say nothing at a glance, so only the focused ones are labelled.
          (dimAround ? neighborIds.has(node.id) : node.depth <= 1 && !node.sensitive);
        return (
          <BeliefOrb
            key={node.id}
            node={node}
            emphasis={emphasis}
            selected={selected}
            hovered={hovered}
            linkSource={node.id === linkSourceId}
            showLabel={showLabel}
            glowTexture={glowTexture}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        );
      })}

      <CameraRig
        controlsRef={controlsRef}
        extent={EXTENT}
        focusKey={focusKey}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        enablePan
        enableZoom
        minDistance={4}
        maxDistance={170}
        maxPolarAngle={Math.PI * 0.86}
      />
    </>
  );
}

export default function BeliefScene({ onBackgroundClick, ...props }: BeliefSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [0, 30, 50], fov: 42, near: 0.1, far: 260 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color("#000000"), 0)}
      onPointerMissed={(event) => {
        // Labels are DOM buttons over the canvas; their clicks reach R3F as misses.
        if (event.type !== "click" || (event.target as Element | null)?.closest?.(".orb-label")) return;
        onBackgroundClick();
      }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <BeliefUniverse {...props} />
    </Canvas>
  );
}

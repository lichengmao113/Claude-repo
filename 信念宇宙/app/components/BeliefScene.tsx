"use client";

/* eslint-disable react/no-unknown-property -- React Three Fiber renders Three.js objects, not DOM nodes. */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import type { BeliefEdge, BeliefNode } from "../lib/belief-types";

export interface BeliefSceneProps {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
  selectedId?: string;
  onSelect: (id: string) => void;
  focusMode: "all" | "neighbors";
  reducedMotion: boolean;
  showBridges: boolean;
}

type OrbitControlsHandle = ElementRef<typeof OrbitControls>;
type VisualKind =
  | "value"
  | "resourceCore"
  | "limitingCore"
  | "rule"
  | "strategy"
  | "bridge"
  | "experience"
  | "other";
type NodeEmphasis = "active" | "normal" | "dim";

const KIND_COLORS: Record<VisualKind, THREE.ColorRepresentation> = {
  value: "#f4c45e",
  resourceCore: "#55d6a9",
  limitingCore: "#ff718a",
  rule: "#62a8ff",
  strategy: "#b78cff",
  bridge: "#4fd8e8",
  experience: "#e49bff",
  other: "#89a7ca",
};

const KIND_BASE_SCALE: Record<VisualKind, number> = {
  value: 0.9,
  resourceCore: 1.08,
  limitingCore: 1.08,
  rule: 0.84,
  strategy: 0.76,
  bridge: 0.7,
  experience: 0.68,
  other: 0.72,
};

const CONFIDENCE_BUCKETS = 5;
const LABEL_LIMIT = 18;

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fieldOf(value: object, key: string): unknown {
  return (value as unknown as Record<string, unknown>)[key];
}

function positionOf(node: BeliefNode): THREE.Vector3 {
  return new THREE.Vector3(
    finiteNumber(node.position?.x),
    finiteNumber(node.position?.y),
    finiteNumber(node.position?.z),
  );
}

function unitScore(value: unknown, fallback = 0.5): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 1) return THREE.MathUtils.clamp(value, 0, 1);
    if (value <= 5) return THREE.MathUtils.clamp((value - 1) / 4, 0, 1);
    return THREE.MathUtils.clamp(value / 100, 0, 1);
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (["high", "strong", "certain", "高", "强", "确定"].includes(normalized)) return 1;
  if (["medium", "moderate", "中", "一般"].includes(normalized)) return 0.6;
  if (["low", "weak", "uncertain", "低", "弱", "不确定"].includes(normalized)) return 0.25;
  return fallback;
}

function visualKind(kind: unknown): VisualKind {
  const normalized = String(kind ?? "").trim().toLowerCase();
  if (["value", "价值", "价值信念"].includes(normalized)) return "value";
  if (["resource-core", "resource", "core", "资源核心", "资源信念", "核心"].includes(normalized)) {
    return "resourceCore";
  }
  if (["limiting-core", "limiting", "限制核心", "限制性信念", "核心信念"].includes(normalized)) {
    return "limitingCore";
  }
  if (["rule", "规则", "规则信念", "assumption", "假设"].includes(normalized)) return "rule";
  if (["strategy", "策略", "interpretation", "解释", "诠释", "meaning", "意义"].includes(normalized)) {
    return "strategy";
  }
  if (["bridge-belief", "bridge", "桥接信念", "桥梁信念"].includes(normalized)) {
    return "bridge";
  }
  if (["experience", "经验", "事件", "evidence", "证据"].includes(normalized)) {
    return "experience";
  }
  return "other";
}

function isSensitive(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["sensitive", "private", "high", "敏感", "私密", "高"].includes(normalized);
}

function isBridge(edge: BeliefEdge): boolean {
  const normalized = String(fieldOf(edge, "type") ?? fieldOf(edge, "kind") ?? "")
    .trim()
    .toLowerCase();
  return ["bridge", "bridging", "桥", "桥梁", "桥接"].includes(normalized);
}

function isBridgeNode(node: BeliefNode): boolean {
  return visualKind(node.kind) === "bridge";
}

function edgeEndpoint(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return undefined;
}

function edgeColor(type: unknown): THREE.Color {
  const normalized = String(type ?? "").trim().toLowerCase();
  if (["support", "supports", "protects", "reinforces", "支持", "保护", "强化"].includes(normalized)) {
    return new THREE.Color("#51d69a");
  }
  if (["conflict", "conflicts-with", "contradicts", "challenges", "冲突", "矛盾", "挑战"].includes(normalized)) {
    return new THREE.Color("#ff718a");
  }
  if (["source", "origin", "shapes", "来源", "源自", "塑造"].includes(normalized)) {
    return new THREE.Color("#a88cff");
  }
  if (["trigger", "drives", "触发", "驱动"].includes(normalized)) return new THREE.Color("#ffac5c");
  if (["reframe", "reframes", "transform", "重构", "转化"].includes(normalized)) {
    return new THREE.Color("#4fd8e8");
  }
  if (["tests", "验证", "测试"].includes(normalized)) return new THREE.Color("#62a8ff");
  if (["bridge", "bridging", "桥", "桥梁", "桥接"].includes(normalized)) {
    return new THREE.Color("#f2d16b");
  }
  return new THREE.Color("#6685ad");
}

function confidenceBucket(confidence: unknown): number {
  return Math.round(unitScore(confidence) * (CONFIDENCE_BUCKETS - 1));
}

function nodeScale(node: BeliefNode): number {
  const kind = visualKind(node.kind);
  const impact = unitScore(fieldOf(node, "impact"));
  const strength = unitScore(fieldOf(node, "strength"));
  return KIND_BASE_SCALE[kind] * (0.72 + impact * 0.44 + strength * 0.14);
}

function safeLabel(node: BeliefNode): string {
  if (isSensitive(fieldOf(node, "sensitivity") ?? fieldOf(node, "sensitive"))) return "敏感信念";
  const characters = Array.from(
    String(fieldOf(node, "text") ?? fieldOf(node, "label") ?? "未命名信念"),
  );
  return characters.length > LABEL_LIMIT
    ? `${characters.slice(0, LABEL_LIMIT).join("")}…`
    : characters.join("");
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function GalaxyBackdrop() {
  const stars = useMemo(() => {
    const random = seededRandom(0x5e7a11);
    const positions = new Float32Array(720 * 3);
    const colors = new Float32Array(720 * 3);
    const cool = new THREE.Color("#8dbdff");
    const warm = new THREE.Color("#d7c1ff");

    for (let index = 0; index < 720; index += 1) {
      const radius = 10 + random() * 32;
      const theta = random() * Math.PI * 2;
      const elevation = (random() - 0.5) * Math.PI;
      const offset = index * 3;
      positions[offset] = Math.cos(theta) * Math.cos(elevation) * radius;
      positions[offset + 1] = Math.sin(elevation) * radius * 0.56;
      positions[offset + 2] = Math.sin(theta) * Math.cos(elevation) * radius;

      const color = cool.clone().lerp(warm, random());
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, []);

  const rings = useMemo(() => {
    const positions: number[] = [];
    for (const radius of [3.2, 6.2, 9.2, 12.2]) {
      const segments = 112;
      for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;
        const nextAngle = ((index + 1) / segments) * Math.PI * 2;
        positions.push(
          Math.cos(angle) * radius,
          Math.sin(angle * 2) * 0.12,
          Math.sin(angle) * radius * 0.7,
          Math.cos(nextAngle) * radius,
          Math.sin(nextAngle * 2) * 0.12,
          Math.sin(nextAngle) * radius * 0.7,
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  useEffect(
    () => () => {
      stars.dispose();
      rings.dispose();
    },
    [rings, stars],
  );

  return (
    <group raycast={() => null}>
      <points geometry={stars}>
        <pointsMaterial
          color="#ffffff"
          size={0.055}
          sizeAttenuation
          transparent
          opacity={0.72}
          vertexColors
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      <lineSegments geometry={rings} rotation={[0.08, 0, -0.04]}>
        <lineBasicMaterial color="#5674a6" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

interface CameraFocusProps {
  controlsRef: RefObject<OrbitControlsHandle | null>;
  target?: THREE.Vector3;
  reducedMotion: boolean;
}

function CameraFocus({ controlsRef, target, reducedMotion }: CameraFocusProps) {
  const camera = useThree((state) => state.camera);
  const clock = useThree((state) => state.clock);
  const invalidate = useThree((state) => state.invalidate);
  const animation = useRef<{
    startedAt: number;
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !target) return;

    const fromTarget = controls.target.clone();
    const direction = camera.position.clone().sub(fromTarget);
    if (direction.lengthSq() < 0.001) direction.set(1, 0.72, 1);
    const toPosition = target.clone().add(direction.normalize().multiplyScalar(8.5));

    if (reducedMotion) {
      animation.current = null;
      controls.target.copy(target);
      camera.position.copy(toPosition);
      controls.update();
      invalidate();
      return;
    }

    animation.current = {
      startedAt: clock.getElapsedTime(),
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget,
      toTarget: target.clone(),
    };
    invalidate();
  }, [camera, clock, controlsRef, invalidate, reducedMotion, target]);

  useFrame(() => {
    const controls = controlsRef.current;
    const current = animation.current;
    if (!controls || !current) return;

    const elapsed = clock.getElapsedTime() - current.startedAt;
    const progress = THREE.MathUtils.clamp(elapsed / 0.72, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(current.fromPosition, current.toPosition, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    controls.update();

    if (progress < 1) invalidate();
    else animation.current = null;
  });

  return null;
}

interface RelationLinesProps {
  edges: BeliefEdge[];
  nodeById: Map<string, BeliefNode>;
  selectedId?: string;
}

function RelationLines({ edges, nodeById, selectedId }: RelationLinesProps) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of edges) {
      const sourceId = edgeEndpoint(edge.source);
      const targetId = edgeEndpoint(edge.target);
      if (!sourceId || !targetId) continue;
      const source = nodeById.get(sourceId);
      const target = nodeById.get(targetId);
      if (!source || !target) continue;

      const sourcePosition = positionOf(source);
      const targetPosition = positionOf(target);
      positions.push(...sourcePosition.toArray(), ...targetPosition.toArray());

      const selected = selectedId === sourceId || selectedId === targetId;
      const confidence = unitScore(edge.confidence);
      const color = edgeColor(fieldOf(edge, "type") ?? fieldOf(edge, "kind"));
      color.multiplyScalar(selected ? 1.08 : 0.38 + confidence * 0.42);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    nextGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    nextGeometry.computeBoundingSphere();
    return nextGeometry;
  }, [edges, nodeById, selectedId]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={-1}>
      <lineBasicMaterial vertexColors transparent opacity={0.78} depthWrite={false} />
    </lineSegments>
  );
}

interface BeliefGlyphProps {
  node: BeliefNode;
  selected: boolean;
  hovered: boolean;
  emphasis: NodeEmphasis;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  haloMaterial: THREE.Material;
  showLabel: boolean;
  onSelect: (id: string) => void;
  onHover: (id?: string) => void;
}

function BeliefGlyph({
  node,
  selected,
  hovered,
  emphasis,
  geometry,
  material,
  haloMaterial,
  showLabel,
  onSelect,
  onHover,
}: BeliefGlyphProps) {
  const position = positionOf(node);
  const scale = nodeScale(node) * (selected ? 1.12 : hovered ? 1.06 : 1);

  return (
    <group position={position} dispose={null}>
      <mesh
        geometry={geometry}
        material={material}
        scale={scale}
        renderOrder={emphasis === "active" ? 3 : emphasis === "normal" ? 2 : 1}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          onHover(node.id);
        }}
        onPointerOut={() => onHover(undefined)}
      />
      {selected ? (
        <mesh geometry={geometry} material={haloMaterial} scale={scale * 1.3} renderOrder={4} />
      ) : null}
      {showLabel ? (
        <Html
          center
          position={[0, scale + 0.48, 0]}
          distanceFactor={10}
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <span
            style={{
              display: "block",
              maxWidth: 220,
              padding: "5px 9px",
              border: "1px solid rgba(179, 205, 255, 0.28)",
              borderRadius: 999,
              background: "rgba(6, 12, 28, 0.84)",
              boxShadow: selected ? "0 0 22px rgba(130, 174, 255, 0.26)" : "none",
              color: "#eef5ff",
              fontSize: 12,
              fontWeight: selected ? 650 : 500,
              lineHeight: 1.25,
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              backdropFilter: "blur(8px)",
            }}
          >
            {safeLabel(node)}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function BeliefGalaxy({
  nodes,
  edges,
  selectedId,
  onSelect,
  focusMode,
  reducedMotion,
  showBridges,
}: BeliefSceneProps) {
  const [hoveredId, setHoveredId] = useState<string>();
  const controlsRef = useRef<OrbitControlsHandle>(null);
  const invalidate = useThree((state) => state.invalidate);

  const eligibleNodes = useMemo(
    () => nodes.filter((node) => showBridges || !isBridgeNode(node)),
    [nodes, showBridges],
  );
  const nodeById = useMemo(
    () => new Map(eligibleNodes.map((node) => [node.id, node])),
    [eligibleNodes],
  );
  const eligibleEdges = useMemo(
    () =>
      edges.filter((edge) => {
        if (!showBridges && isBridge(edge)) return false;
        const sourceId = edgeEndpoint(edge.source);
        const targetId = edgeEndpoint(edge.target);
        return Boolean(sourceId && targetId && nodeById.has(sourceId) && nodeById.has(targetId));
      }),
    [edges, nodeById, showBridges],
  );

  const neighborIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedId || !nodeById.has(selectedId)) return ids;
    ids.add(selectedId);
    for (const edge of eligibleEdges) {
      const sourceId = edgeEndpoint(edge.source);
      const targetId = edgeEndpoint(edge.target);
      if (sourceId === selectedId && targetId) ids.add(targetId);
      if (targetId === selectedId && sourceId) ids.add(sourceId);
    }
    return ids;
  }, [eligibleEdges, nodeById, selectedId]);

  const visibleNodes = useMemo(() => {
    if (focusMode === "all" || !selectedId || neighborIds.size === 0) return eligibleNodes;
    return eligibleNodes.filter((node) => neighborIds.has(node.id));
  }, [eligibleNodes, focusMode, neighborIds, selectedId]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () =>
      eligibleEdges.filter((edge) => {
        const sourceId = edgeEndpoint(edge.source);
        const targetId = edgeEndpoint(edge.target);
        return Boolean(sourceId && targetId && visibleIds.has(sourceId) && visibleIds.has(targetId));
      }),
    [eligibleEdges, visibleIds],
  );

  const geometries = useMemo<Record<VisualKind, THREE.BufferGeometry>>(
    () => ({
      value: new THREE.SphereGeometry(1, 20, 14),
      resourceCore: new THREE.IcosahedronGeometry(1, 2),
      limitingCore: new THREE.IcosahedronGeometry(1, 1),
      rule: new THREE.BoxGeometry(1.45, 1.45, 1.45, 1, 1, 1),
      strategy: new THREE.OctahedronGeometry(1, 1),
      bridge: new THREE.TetrahedronGeometry(1, 1),
      experience: new THREE.DodecahedronGeometry(1, 0),
      other: new THREE.SphereGeometry(1, 18, 12),
    }),
    [],
  );

  const materials = useMemo(() => {
    const library = new Map<string, THREE.MeshStandardMaterial>();
    const emphasisOpacity: Record<NodeEmphasis, number> = { active: 1, normal: 0.88, dim: 0.42 };
    const emphasisLight: Record<NodeEmphasis, number> = { active: 0.8, normal: 0.24, dim: 0.08 };

    for (const kind of Object.keys(KIND_COLORS) as VisualKind[]) {
      for (let bucket = 0; bucket < CONFIDENCE_BUCKETS; bucket += 1) {
        const confidence = bucket / (CONFIDENCE_BUCKETS - 1);
        for (const emphasis of ["active", "normal", "dim"] as NodeEmphasis[]) {
          const color = new THREE.Color(KIND_COLORS[kind]);
          library.set(
            `${kind}:${bucket}:${emphasis}`,
            new THREE.MeshStandardMaterial({
              color,
              emissive: color.clone().multiplyScalar(0.62),
              emissiveIntensity: emphasisLight[emphasis],
              metalness: kind === "resourceCore" || kind === "limitingCore" ? 0.32 : 0.12,
              roughness: kind === "resourceCore" || kind === "limitingCore" ? 0.34 : 0.48,
              transparent: true,
              opacity: (0.3 + confidence * 0.68) * emphasisOpacity[emphasis],
              depthWrite: false,
            }),
          );
        }
      }
    }
    return library;
  }, []);

  const haloMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ddebff",
        transparent: true,
        opacity: 0.34,
        wireframe: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      haloMaterial.dispose();
    },
    [geometries, haloMaterial, materials],
  );

  const selectedTarget = useMemo(() => {
    const selected = selectedId ? nodeById.get(selectedId) : undefined;
    return selected ? positionOf(selected) : undefined;
  }, [nodeById, selectedId]);

  const handleHover = (id?: string) => {
    setHoveredId(id);
    invalidate();
  };

  return (
    <>
      <color attach="background" args={["#050816"]} />
      <fog attach="fog" args={["#050816", 36, 74]} />
      <ambientLight intensity={0.92} />
      <directionalLight position={[8, 12, 10]} intensity={1.35} color="#dceaff" />
      <pointLight position={[-8, -3, 4]} intensity={18} distance={24} color="#6a52cc" />

      <GalaxyBackdrop />
      <RelationLines edges={visibleEdges} nodeById={nodeById} selectedId={selectedId} />
      {visibleNodes.map((node) => {
        const kind = visualKind(node.kind);
        const selected = node.id === selectedId;
        const hovered = node.id === hoveredId;
        const archived = fieldOf(node, "status") === "archived";
        const emphasis: NodeEmphasis =
          selected || hovered
            ? "active"
            : archived || (selectedId && !neighborIds.has(node.id))
              ? "dim"
              : "normal";
        const material = materials.get(`${kind}:${confidenceBucket(node.confidence)}:${emphasis}`);
        if (!material) return null;

        return (
          <BeliefGlyph
            key={node.id}
            node={node}
            selected={selected}
            hovered={hovered}
            emphasis={emphasis}
            geometry={geometries[kind]}
            material={material}
            haloMaterial={haloMaterial}
            showLabel={selected || hovered}
            onSelect={onSelect}
            onHover={handleHover}
          />
        );
      })}

      <CameraFocus controlsRef={controlsRef} target={selectedTarget} reducedMotion={reducedMotion} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.075}
        enablePan
        enableZoom
        autoRotate={false}
        minDistance={3.5}
        maxDistance={64}
        maxPolarAngle={Math.PI * 0.92}
        onChange={() => invalidate()}
      />
    </>
  );
}

export default function BeliefScene(props: BeliefSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [0, 18, 44], fov: 55, near: 0.1, far: 112 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <BeliefGalaxy {...props} />
    </Canvas>
  );
}

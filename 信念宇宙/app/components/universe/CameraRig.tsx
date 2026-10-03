"use client";

import { useEffect, useRef, type ElementRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export type OrbitControlsHandle = ElementRef<typeof OrbitControls>;

/** Camera height above the floor, as a share of its distance, for the overview. */
const HOME_ELEVATION = 0.56;
/** Flying to a node keeps its neighbourhood in view instead of filling the screen with it. */
const FOCUS_DISTANCE = { min: 20, max: 32 };

interface CameraRigProps {
  controlsRef: RefObject<OrbitControlsHandle | null>;
  /** Radius that the overview must fit. */
  extent: number;
  /** "x,y,z" of the node to fly to; a string so edits that keep the node in place do not move the camera. */
  focusKey?: string;
  /** Increment to fly back to the overview. */
  resetToken: number;
  reducedMotion: boolean;
}

type Flight = {
  startedAt: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

function homePose(camera: THREE.Camera, extent: number) {
  const perspective = camera as THREE.PerspectiveCamera;
  const verticalHalf = THREE.MathUtils.degToRad(perspective.fov ?? 42) / 2;
  const horizontalHalf = Math.atan(Math.tan(verticalHalf) * (perspective.aspect || 1));
  // Perspective enlarges the near rim, so leave a margin beyond the bare fit.
  // On a portrait phone the whole disc would shrink to dots; frame the inner rings instead.
  const portrait = (perspective.aspect || 1) < 0.75;
  const distance = (extent / Math.tan(Math.min(verticalHalf * 1.15, horizontalHalf))) * (portrait ? 0.58 : 1.16);
  const direction = new THREE.Vector3(0.18, HOME_ELEVATION, 1).normalize();
  return {
    position: direction.multiplyScalar(distance),
    target: new THREE.Vector3(0, 0.6, 0),
  };
}

/** Frames the whole universe on load, flies to the selected node and back on reset. */
export function CameraRig({ controlsRef, extent, focusKey, resetToken, reducedMotion }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const clock = useThree((state) => state.clock);
  const invalidate = useThree((state) => state.invalidate);
  const flight = useRef<Flight | null>(null);
  const placed = useRef(false);

  const flyTo = (toPosition: THREE.Vector3, toTarget: THREE.Vector3) => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (reducedMotion) {
      flight.current = null;
      camera.position.copy(toPosition);
      controls.target.copy(toTarget);
      controls.update();
      invalidate();
      return;
    }
    flight.current = {
      startedAt: clock.getElapsedTime(),
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget: controls.target.clone(),
      toTarget,
    };
    invalidate();
  };

  // First frame: jump straight to the overview.
  useEffect(() => {
    const controls = controlsRef.current;
    if (placed.current || !controls) return;
    const pose = homePose(camera, extent);
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    controls.update();
    placed.current = true;
    invalidate();
  });

  useEffect(() => {
    if (!resetToken) return;
    const pose = homePose(camera, extent);
    flyTo(pose.position, pose.target);
    // flyTo is recreated every render; the token is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!focusKey || !controls) return;
    const [x, y, z] = focusKey.split(",").map(Number);
    const target = new THREE.Vector3(x, y, z);
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 0.001) direction.set(0.2, 0.6, 1);
    const distance = THREE.MathUtils.clamp(direction.length(), FOCUS_DISTANCE.min, FOCUS_DISTANCE.max);
    flyTo(target.clone().add(direction.normalize().multiplyScalar(distance)), target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  useFrame(() => {
    const controls = controlsRef.current;
    const current = flight.current;
    if (!controls || !current) return;
    const progress = THREE.MathUtils.clamp((clock.getElapsedTime() - current.startedAt) / 0.85, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(current.fromPosition, current.toPosition, eased);
    controls.target.lerpVectors(current.fromTarget, current.toTarget, eased);
    controls.update();
    if (progress < 1) invalidate();
    else flight.current = null;
  });

  return null;
}

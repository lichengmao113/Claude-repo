import type { Metadata } from "next";
import { BeliefUniverseApp } from "./components/BeliefUniverseApp";

export const metadata: Metadata = {
  title: "信念宇宙 · Belief Atlas",
  description:
    "一个只在本机运行的3D信念图谱，用来观察核心信念、保护策略、内在冲突与正在形成的新选择。",
};

export default function Home() {
  return <BeliefUniverseApp />;
}

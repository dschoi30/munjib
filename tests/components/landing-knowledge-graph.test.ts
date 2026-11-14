// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const svg = new DOMParser().parseFromString(
  readFileSync(resolve(process.cwd(), "public/landing-knowledge-graph.svg"), "utf8"),
  "image/svg+xml",
);

describe("landing knowledge graph illustration", () => {
  it("uses a circular document network and sizes every node by its actual link count", () => {
    const circles = [...svg.querySelectorAll("circle")];
    const lines = [...svg.querySelectorAll("line")];
    expect(circles.length).toBeGreaterThan(500);
    expect(lines.length).toBeGreaterThan(400);

    const degrees = Array(circles.length).fill(0) as number[];
    const uniqueEdges = new Set<string>();
    for (const line of lines) {
      const source = Number(line.getAttribute("data-source"));
      const target = Number(line.getAttribute("data-target"));
      expect(source).toBeGreaterThanOrEqual(0);
      expect(target).toBeLessThan(circles.length);
      expect(source).not.toBe(target);
      uniqueEdges.add(`${Math.min(source, target)}:${Math.max(source, target)}`);
      degrees[source] += 1;
      degrees[target] += 1;
    }
    expect(uniqueEdges.size).toBe(lines.length);

    const radiusByDegree = new Map<number, number>();
    const positions = circles.map((circle, index) => {
      expect(Number(circle.getAttribute("data-node"))).toBe(index);
      expect(Number(circle.getAttribute("data-connections"))).toBe(degrees[index]);
      const radius = Number(circle.getAttribute("r"));
      const previousRadius = radiusByDegree.get(degrees[index]);
      if (previousRadius !== undefined) expect(radius).toBe(previousRadius);
      radiusByDegree.set(degrees[index], radius);
      return [Number(circle.getAttribute("cx")), Number(circle.getAttribute("cy"))];
    });

    const orderedRadii = [...radiusByDegree].sort(([a], [b]) => a - b).map(([, radius]) => radius);
    expect(orderedRadii.every((radius, index) => index === 0 || radius > orderedRadii[index - 1])).toBe(true);
    expect(Math.max(...positions.map(([x]) => x)) - Math.min(...positions.map(([x]) => x))).toBeGreaterThan(620);
    expect(Math.max(...positions.map(([, y]) => y)) - Math.min(...positions.map(([, y]) => y))).toBeGreaterThan(620);
    expect(positions.every(([x, y]) => Math.hypot(x - 420.5, y - 372) < 338)).toBe(true);
  });
});

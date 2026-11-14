import { writeFileSync } from "node:fs";

// A fixed example document graph for the public landing page. The links below,
// rather than visual randomness, determine every node's rendered radius.
const width = 841;
const height = 744;
const center = { x: width / 2, y: height / 2 };
const documentCount = 560;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const documents = Array.from({ length: documentCount }, (_, index) => {
  const fraction = (index + 0.5) / documentCount;
  const angle = index * goldenAngle;
  const distance = 17 + Math.sqrt(fraction) * 313;
  const drift = Math.sin(index * 19.37) * 3.2;
  return {
    x: center.x + Math.cos(angle) * (distance + drift),
    y: center.y + Math.sin(angle) * (distance + drift),
    kind: "document",
  };
});

const hubPositions = [
  [-112, -170], [70, -185], [195, -128], [-218, -91], [-53, -86],
  [119, -55], [240, 17], [-256, 44], [-147, 56], [7, 26],
  [155, 90], [-211, 166], [-52, 163], [87, 200], [222, 190],
  [-114, -4], [43, -111], [-6, 239],
];
const hubs = hubPositions.map(([x, y]) => ({ x: center.x + x, y: center.y + y, kind: "hub" }));
const nodes = [...documents, ...hubs];
const connections = new Set();

function connect(a, b) {
  if (a === b) return;
  connections.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
}

function nearest(source, candidates, count, maxDistance) {
  return candidates
    .map((index) => ({ index, distance: Math.hypot(nodes[source].x - nodes[index].x, nodes[source].y - nodes[index].y) }))
    .filter(({ index, distance }) => index !== source && distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, count)
    .map(({ index }) => index);
}

const documentIds = documents.map((_, index) => index);
const hubIds = hubs.map((_, index) => documentCount + index);

// Dense local references form recognisable communities around important documents.
for (const hub of hubIds) {
  const nearbyDocuments = nearest(hub, documentIds, 17, 85);
  for (const document of nearbyDocuments) connect(hub, document);
  for (const neighbour of nearest(hub, hubIds, 2, 165)) connect(hub, neighbour);
}

// A subset of ordinary documents link to their actual nearest neighbours.
for (let document = 0; document < documentCount; document += 3) {
  for (const neighbour of nearest(document, documentIds, document % 9 === 0 ? 2 : 1, 35)) {
    connect(document, neighbour);
  }
}

const edges = [...connections].map((pair) => pair.split(":").map(Number));
const degree = Array(nodes.length).fill(0);
for (const [a, b] of edges) {
  degree[a] += 1;
  degree[b] += 1;
}

const lineMarkup = edges.map(([a, b]) => {
  const source = nodes[a];
  const target = nodes[b];
  const isHubLink = source.kind === "hub" || target.kind === "hub";
  return `<line data-source="${a}" data-target="${b}" x1="${source.x.toFixed(2)}" y1="${source.y.toFixed(2)}" x2="${target.x.toFixed(2)}" y2="${target.y.toFixed(2)}" stroke="#7891A3" stroke-opacity="${isHubLink ? "0.29" : "0.18"}" stroke-width="${isHubLink ? "0.85" : "0.7"}"/>`;
}).join("\n");

const nodeMarkup = nodes.map((node, index) => {
  // Monotonic degree scale: a document with more links is always larger.
  const radius = Math.min(10.5, 3.8 + 1.35 * Math.sqrt(degree[index]));
  const opacity = degree[index] > 8 ? 0.92 : degree[index] > 0 ? 0.78 : 0.6;
  const fill = degree[index] > 8 ? "#56758C" : "#839BAD";
  return `<circle data-node="${index}" data-connections="${degree[index]}" cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${radius.toFixed(2)}" fill="${fill}" fill-opacity="${opacity}"/>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" aria-hidden="true">
<!-- Example document network: ${nodes.length} nodes, ${edges.length} unique links. Node radius is derived from link count. -->
<g>${lineMarkup}</g>
<g>${nodeMarkup}</g>
</svg>\n`;

writeFileSync(new URL("../public/landing-knowledge-graph.svg", import.meta.url), svg);

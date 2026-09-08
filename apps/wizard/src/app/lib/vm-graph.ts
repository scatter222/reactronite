// Dependency-graph helpers for the VM deployment screen.
//
// Everything here is dependency-free maths: layer assignment, crossing
// reduction and bezier edge geometry are computed locally so the graph view
// works in a fully offline/air-gapped deployment (no CDN, no layout engine).

import type { VMConfig, VMConfigFile } from '@/app/types/vm-config';

export type InstallPhase =
  | 'pending'
  | 'creating'
  | 'starting'
  | 'waiting'
  | 'transferring'
  | 'post-boot'
  | 'complete'
  | 'error';

export const PHASE_LABELS: Record<InstallPhase, string> = {
  pending: 'Pending',
  creating: 'Creating',
  starting: 'Starting',
  waiting: 'Waiting for agent',
  transferring: 'Transferring files',
  'post-boot': 'Running post-boot',
  complete: 'Complete',
  error: 'Error',
};

/** Tailwind classes for the small status dot in the sidebar list. */
export const PHASE_COLORS: Record<InstallPhase, string> = {
  pending: 'bg-slate-500',
  creating: 'bg-blue-500 animate-pulse',
  starting: 'bg-blue-500 animate-pulse',
  waiting: 'bg-yellow-500 animate-pulse',
  transferring: 'bg-yellow-500 animate-pulse',
  'post-boot': 'bg-orange-500 animate-pulse',
  complete: 'bg-green-500',
  error: 'bg-red-500',
};

/** Literal colours, for SVG strokes/fills where Tailwind classes don't apply. */
export const PHASE_HEX: Record<InstallPhase, string> = {
  pending: '#64748b',
  creating: '#3b82f6',
  starting: '#3b82f6',
  waiting: '#eab308',
  transferring: '#eab308',
  'post-boot': '#f97316',
  complete: '#22c55e',
  error: '#ef4444',
};

/** Rough completion percentage used for the per-node progress ring. */
export const PHASE_PROGRESS: Record<InstallPhase, number> = {
  pending: 0,
  creating: 15,
  starting: 35,
  waiting: 55,
  transferring: 70,
  'post-boot': 85,
  complete: 100,
  error: 100,
};

const ACTIVE_PHASES: InstallPhase[] = [
  'creating',
  'starting',
  'waiting',
  'transferring',
  'post-boot',
];

export const isActivePhase = (phase: InstallPhase) => ACTIVE_PHASES.includes(phase);

/**
 * `vms` in vm-config.json is accepted either as a flat list or as an explicit
 * list of tiers (arrays of VMs deployed in parallel). Normalise both shapes to
 * tiers: a flat list is layered by its `depends_on` graph, so VMs that share a
 * dependency depth deploy together, ordered within the tier by `priority`.
 */
export function normalizeTiers(vms: VMConfigFile['vms'] | VMConfig[] | undefined): VMConfig[][] {
  if (!Array.isArray(vms) || vms.length === 0) return [];

  const anyNested = vms.some(entry => Array.isArray(entry));
  if (anyNested) {
    return (vms as unknown[])
      .map(entry => (Array.isArray(entry) ? entry as VMConfig[] : [entry as VMConfig]))
      .filter(tier => tier.length > 0);
  }

  const flat = vms as unknown as VMConfig[];
  const depth = dependencyDepths(flat);
  const buckets = new Map<number, VMConfig[]>();

  for (const vm of flat) {
    const key = depth.get(vm.name) ?? 0;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(vm);
    else buckets.set(key, [vm]);
  }

  // One tier per dependency depth; `priority` only orders VMs inside a tier.
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map(key => buckets.get(key)!.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)));
}

export function flattenTiers(tiers: VMConfig[][]): VMConfig[] {
  return tiers.flat();
}

/**
 * Longest-path depth of each VM in the `depends_on` graph. Unknown and cyclic
 * dependencies are ignored so a malformed config still renders.
 */
function dependencyDepths(vms: VMConfig[]): Map<string, number> {
  const byName = new Map(vms.map(vm => [vm.name, vm]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (name: string): number => {
    if (depth.has(name)) return depth.get(name)!;
    if (visiting.has(name)) return 0; // cycle: treat as a root
    visiting.add(name);

    const deps = (byName.get(name)?.depends_on || []).filter(dep => byName.has(dep) && dep !== name);
    const value = deps.length === 0 ? 0 : Math.max(...deps.map(resolve)) + 1;

    visiting.delete(name);
    depth.set(name, value);
    return value;
  };

  vms.forEach(vm => resolve(vm.name));
  return depth;
}

/**
 * Dependency edges (`dep -> vm`) that close a cycle, found with a depth-first
 * walk. They are excluded from layer assignment and drawn as a warning.
 */
function findBackEdges(vms: VMConfig[], depsOf: Map<string, string[]>): Set<string> {
  const back = new Set<string>();
  const visiting = new Set<string>();
  const done = new Set<string>();

  const walk = (name: string) => {
    if (done.has(name)) return;
    visiting.add(name);

    for (const dep of depsOf.get(name) || []) {
      if (visiting.has(dep)) back.add(`${dep}->${name}`);
      else walk(dep);
    }

    visiting.delete(name);
    done.add(name);
  };

  vms.forEach(vm => walk(vm.name));
  return back;
}

export interface GraphNode {
  name: string;
  vm: VMConfig;
  layer: number;
  /** Index of the tier the VM was declared in (drives the tier band labels). */
  tier: number;
  deps: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  path: string;
  /** Edge that closes a cycle in the config — drawn as a warning. */
  cyclic: boolean;
}

export interface GraphLayerBand {
  layer: number;
  label: string;
  y: number;
  height: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bands: GraphLayerBand[];
  width: number;
  height: number;
}

export const NODE_WIDTH = 216;
export const NODE_HEIGHT = 88;

const GAP_X = 36;
const GAP_Y = 148;
const PADDING_X = 80;
const PADDING_Y = 40;

const EMPTY_LAYOUT: GraphLayout = { nodes: [], edges: [], bands: [], width: 0, height: 0 };

/**
 * Layered ("Sugiyama-lite") DAG layout: assign layers from tier index and
 * dependencies, order each layer by the average position of its parents to cut
 * crossings, then centre the rows and emit bezier edge paths.
 */
export function buildGraphLayout(tiers: VMConfig[][]): GraphLayout {
  const vms = flattenTiers(tiers);
  if (vms.length === 0) return EMPTY_LAYOUT;

  const tierOf = new Map<string, number>();
  tiers.forEach((tier, index) => tier.forEach(vm => tierOf.set(vm.name, index)));

  const known = new Set(vms.map(vm => vm.name));
  const depsOf = new Map<string, string[]>(
    vms.map(vm => [
      vm.name,
      [...new Set((vm.depends_on || []).filter(dep => known.has(dep) && dep !== vm.name))]
    ])
  );

  const backEdges = findBackEdges(vms, depsOf);

  // Layer = max(declared tier, deepest dependency + 1), ignoring cycle-closing
  // edges. Relaxed iteratively; the pass count bounds the work.
  const layer = new Map<string, number>(vms.map(vm => [vm.name, tierOf.get(vm.name) ?? 0]));
  for (let pass = 0; pass < vms.length; pass++) {
    let changed = false;
    for (const vm of vms) {
      const deps = depsOf.get(vm.name)!.filter(dep => !backEdges.has(`${dep}->${vm.name}`));
      if (deps.length === 0) continue;
      const wanted = Math.max(...deps.map(dep => layer.get(dep)!)) + 1;
      if (wanted > layer.get(vm.name)!) {
        layer.set(vm.name, wanted);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const layerCount = Math.max(...vms.map(vm => layer.get(vm.name)!)) + 1;
  const rows: VMConfig[][] = Array.from({ length: layerCount }, (): VMConfig[] => []);
  vms.forEach(vm => rows[layer.get(vm.name)!].push(vm));

  // Two barycenter sweeps: order each row by the mean index of its parents.
  const orderInRow = new Map<string, number>();
  rows.forEach(row => row.forEach((vm, index) => orderInRow.set(vm.name, index)));

  for (let sweep = 0; sweep < 2; sweep++) {
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index];
      const scored = row.map((vm, fallback) => {
        const parents = depsOf.get(vm.name)!.map(dep => orderInRow.get(dep) ?? 0);
        const score = parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : fallback;
        return { vm, score, fallback };
      });
      scored.sort((a, b) => a.score - b.score || a.fallback - b.fallback);
      rows[index] = scored.map(entry => entry.vm);
      rows[index].forEach((vm, position) => orderInRow.set(vm.name, position));
    }
  }

  const rowWidth = (row: VMConfig[]) => row.length * NODE_WIDTH + Math.max(0, row.length - 1) * GAP_X;
  const widest = Math.max(...rows.map(rowWidth));
  const width = widest + PADDING_X * 2;
  const height = layerCount * NODE_HEIGHT + Math.max(0, layerCount - 1) * (GAP_Y - NODE_HEIGHT) + PADDING_Y * 2;

  const nodes: GraphNode[] = [];
  const bands: GraphLayerBand[] = [];

  rows.forEach((row, index) => {
    const y = PADDING_Y + index * GAP_Y;
    const startX = PADDING_X + (widest - rowWidth(row)) / 2;

    bands.push({
      layer: index,
      label: `Tier ${index + 1}`,
      y: y - 18,
      height: NODE_HEIGHT + 36,
    });

    row.forEach((vm, position) => {
      nodes.push({
        name: vm.name,
        vm,
        layer: index,
        tier: tierOf.get(vm.name) ?? index,
        deps: depsOf.get(vm.name)!,
        x: startX + position * (NODE_WIDTH + GAP_X),
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  });

  const nodeByName = new Map(nodes.map(node => [node.name, node]));
  const edges: GraphEdge[] = [];

  for (const node of nodes) {
    for (const dep of node.deps) {
      const parent = nodeByName.get(dep);
      if (!parent) continue;

      const cyclic = backEdges.has(`${dep}->${node.name}`) || parent.layer >= node.layer;
      const sx = parent.x + parent.width / 2;
      const sy = parent.y + parent.height;
      const tx = node.x + node.width / 2;
      const ty = node.y;
      const bend = Math.max(30, Math.abs(ty - sy) / 2);

      edges.push({
        id: `${dep}->${node.name}`,
        from: dep,
        to: node.name,
        path: `M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`,
        cyclic,
      });
    }
  }

  return { nodes, edges, bands, width, height: Math.max(height, PADDING_Y * 2 + NODE_HEIGHT) };
}

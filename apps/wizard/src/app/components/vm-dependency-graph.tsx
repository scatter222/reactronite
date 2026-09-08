import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Crosshair, Maximize2, Minus, Network, Plus } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  buildGraphLayout,
  isActivePhase,
  PHASE_HEX,
  PHASE_LABELS,
  PHASE_PROGRESS,
  type GraphNode,
  type InstallPhase,
} from '@/app/lib/vm-graph';
import type { VMConfig, VMState } from '@/app/types/vm-config';

interface VMDependencyGraphProps {
  tiers: VMConfig[][];
  phases: Record<string, InstallPhase>;
  vmStates: Record<string, VMState>;
  lastLogByVM: Record<string, string>;
  selectedVM: string | null;
  /** Click a node to jump back to that VM's log stream. */
  onOpenLogs: (vmName: string) => void;
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Rough character budget so long VM names don't overflow the node card. */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function VMDependencyGraph({
  tiers,
  phases,
  vmStates,
  lastLogByVM,
  selectedVM,
  onOpenLogs,
}: VMDependencyGraphProps) {
  const layout = useMemo(() => buildGraphLayout(tiers), [tiers]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const stopDragRef = useRef<(() => void) | null>(null);
  // A pan gesture ends with a click event; swallow that one click.
  const suppressClickRef = useRef(false);
  // Once the user zooms or pans, stop auto-fitting on container resize.
  const userAdjustedRef = useRef(false);

  const phaseOf = useCallback(
    (name: string): InstallPhase => phases[name] || (vmStates[name]?.state === 'running' ? 'complete' : 'pending'),
    [phases, vmStates]
  );

  const fit = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || layout.width === 0 || layout.height === 0) return;

    userAdjustedRef.current = false;
    const k = clamp(Math.min(box.width / layout.width, box.height / layout.height), MIN_ZOOM, 1);
    setView({
      k,
      x: (box.width - layout.width * k) / 2,
      y: (box.height - layout.height * k) / 2,
    });
  }, [layout.width, layout.height]);

  // Fit whenever the graph shape changes, and keep it fitted on resize.
  useLayoutEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (!userAdjustedRef.current) fit();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit]);

  // Wheel zoom about the cursor. Registered natively so preventDefault works.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userAdjustedRef.current = true;
      const box = node.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;

      setView(prev => {
        const k = clamp(prev.k * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        const ratio = k / prev.k;
        return { k, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
      });
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => () => stopDragRef.current?.(), []);

  const zoomBy = (factor: number) => {
    userAdjustedRef.current = true;
    const box = containerRef.current?.getBoundingClientRect();
    setView(prev => {
      const k = clamp(prev.k * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = k / prev.k;
      const px = (box?.width ?? 0) / 2;
      const py = (box?.height ?? 0) / 2;
      return { k, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
    });
  };

  // Pan with window-level listeners rather than setPointerCapture: capturing the
  // pointer on the <svg> would retarget the follow-up click away from the node.
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || dragRef.current) return;

    const drag = {
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
      moved: false,
    };
    dragRef.current = drag;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        drag.moved = true;
        userAdjustedRef.current = true;
      }
      setView(prev => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }));
    };

    const onUp = () => {
      // A pan ends with a click event on the node underneath; swallow that one.
      suppressClickRef.current = drag.moved;
      dragRef.current = null;
      stopDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    stopDragRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const openLogs = (name: string) => {
    // Ignore the click that ends a pan gesture.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpenLogs(name);
  };

  const total = layout.nodes.length;
  const done = layout.nodes.filter(node => phaseOf(node.name) === 'complete').length;
  const failed = layout.nodes.filter(node => phaseOf(node.name) === 'error').length;
  const running = layout.nodes.filter(node => isActivePhase(phaseOf(node.name))).length;
  // Failed VMs are excluded from the aggregate so the bar reads as progress
  // towards a working deployment, not "done".
  const tracked = layout.nodes.filter(node => phaseOf(node.name) !== 'error');
  const overall = tracked.length === 0
    ? 0
    : Math.round(tracked.reduce((sum, node) => sum + PHASE_PROGRESS[phaseOf(node.name)], 0) / tracked.length);

  if (total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 bg-slate-950 text-slate-500">
        <Network className="w-8 h-8" />
        <p className="text-sm">No VMs defined in vm-config.json</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
      {/* Toolbar: overall progress + view controls */}
      <div className="shrink-0 flex items-center gap-4 px-3 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-slate-300 font-medium">{done}/{total} complete</span>
          <div className="w-40 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${failed > 0 ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${overall}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{overall}%</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {running > 0 && <span className="text-blue-400">{running} in progress</span>}
          {failed > 0 && <span className="text-red-400">{failed} failed</span>}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => zoomBy(1 / 1.2)} title="Zoom out">
            <Minus className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-500 w-10 text-center tabular-nums">{Math.round(view.k * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => zoomBy(1.2)} title="Zoom in">
            <Plus className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={fit} title="Fit to view">
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        <svg
          className="w-full h-full cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={onPointerDown}
          onDoubleClick={fit}
        >
          <defs>
            <pattern
              id="vm-graph-grid"
              width="28"
              height="28"
              patternUnits="userSpaceOnUse"
              patternTransform={`translate(${view.x} ${view.y}) scale(${view.k})`}
            >
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgb(30 41 59 / 0.5)" strokeWidth="1" />
            </pattern>
            {['#334155', '#3b82f6', '#22c55e', '#ef4444'].map(color => (
              <marker
                key={color}
                id={`vm-arrow-${color.slice(1)}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>

          <rect width="100%" height="100%" fill="url(#vm-graph-grid)" />

          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {/* Tier bands */}
            {layout.bands.map(band => (
              <g key={band.layer}>
                <rect
                  x={8}
                  y={band.y}
                  width={Math.max(0, layout.width - 16)}
                  height={band.height}
                  rx={14}
                  fill="rgb(15 23 42 / 0.6)"
                  stroke="rgb(30 41 59)"
                  strokeDasharray="4 6"
                />
                <text x={22} y={band.y + 16} className="fill-slate-600" fontSize={11} fontWeight={600}>
                  {band.label.toUpperCase()}
                </text>
              </g>
            ))}

            <Edges
              layout={layout}
              phaseOf={phaseOf}
              highlighted={hovered || selectedVM}
            />

            {layout.nodes.map(node => (
              <NodeCard
                key={node.name}
                node={node}
                phase={phaseOf(node.name)}
                state={vmStates[node.name]}
                lastLog={lastLogByVM[node.name]}
                selected={selectedVM === node.name}
                dimmed={Boolean(hovered) && hovered !== node.name && !isRelated(layout.edges, hovered!, node.name)}
                onHover={setHovered}
                onOpen={openLogs}
              />
            ))}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-800 bg-slate-900/85 px-3 py-2 backdrop-blur-sm">
          {(['pending', 'creating', 'waiting', 'post-boot', 'complete', 'error'] as InstallPhase[]).map(phase => (
            <span key={phase} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PHASE_HEX[phase] }} />
              {PHASE_LABELS[phase]}
            </span>
          ))}
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/85 px-3 py-2 text-[11px] text-slate-500 backdrop-blur-sm">
          <Crosshair className="w-3 h-3" />
          Click a VM to open its logs · drag to pan · scroll to zoom
        </div>
      </div>
    </div>
  );
}

const isRelated = (edges: { from: string; to: string }[], anchor: string, name: string) =>
  edges.some(edge => (edge.from === anchor && edge.to === name) || (edge.to === anchor && edge.from === name));

interface EdgesProps {
  layout: ReturnType<typeof buildGraphLayout>;
  phaseOf: (name: string) => InstallPhase;
  highlighted: string | null;
}

function Edges({ layout, phaseOf, highlighted }: EdgesProps) {
  return (
    <g fill="none">
      {layout.edges.map(edge => {
        const sourcePhase = phaseOf(edge.from);
        const targetPhase = phaseOf(edge.to);
        const flowing = isActivePhase(targetPhase) && sourcePhase === 'complete';

        let color = '#334155';
        if (edge.cyclic || targetPhase === 'error') color = '#ef4444';
        else if (flowing) color = '#3b82f6';
        else if (sourcePhase === 'complete') color = '#22c55e';

        const touched = highlighted === edge.from || highlighted === edge.to;

        return (
          <path
            key={edge.id}
            d={edge.path}
            stroke={color}
            strokeWidth={touched ? 2.5 : 1.75}
            strokeOpacity={highlighted && !touched ? 0.25 : 0.9}
            strokeDasharray={edge.cyclic && !flowing ? '5 5' : undefined}
            className={flowing ? 'vm-graph-flow' : undefined}
            markerEnd={`url(#vm-arrow-${color.slice(1)})`}
          />
        );
      })}
    </g>
  );
}

interface NodeCardProps {
  node: GraphNode;
  phase: InstallPhase;
  state?: VMState;
  lastLog?: string;
  selected: boolean;
  dimmed: boolean;
  onHover: (name: string | null) => void;
  onOpen: (name: string) => void;
}

function NodeCard({ node, phase, state, lastLog, selected, dimmed, onHover, onOpen }: NodeCardProps) {
  const color = PHASE_HEX[phase];
  const active = isActivePhase(phase);
  const progress = PHASE_PROGRESS[phase];
  const cx = node.x + 34;
  const cy = node.y + node.height / 2 - 6;
  const subtitle = lastLog || state?.ipAddress || node.vm.description || '';

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${node.name}: ${PHASE_LABELS[phase]}. Open logs`}
      className="cursor-pointer focus:outline-none"
      opacity={dimmed ? 0.35 : 1}
      onClick={() => onOpen(node.name)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(node.name);
        }
      }}
      onMouseEnter={() => onHover(node.name)}
      onMouseLeave={() => onHover(null)}
    >
      {active && (
        <rect
          x={node.x - 4}
          y={node.y - 4}
          width={node.width + 8}
          height={node.height + 8}
          rx={16}
          fill="none"
          stroke={color}
          strokeWidth={2}
          className="vm-graph-glow"
        />
      )}

      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={12}
        fill={selected ? 'rgb(30 41 59)' : 'rgb(15 23 42)'}
        stroke={selected ? '#60a5fa' : color}
        strokeWidth={selected ? 2 : 1.25}
        strokeOpacity={selected || active ? 1 : 0.55}
      />

      {/* Status ring: static track, progress arc, and a spinner while working */}
      <circle cx={cx} cy={cy} r={RING_RADIUS} fill="none" stroke="rgb(51 65 85)" strokeWidth={3} />
      <circle
        cx={cx}
        cy={cy}
        r={RING_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${(RING_CIRCUMFERENCE * progress) / 100} ${RING_CIRCUMFERENCE}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 400ms ease' }}
      />
      {active && (
        <g className="vm-graph-spin">
          <circle
            cx={cx}
            cy={cy}
            r={RING_RADIUS + 5}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE * 0.22} ${RING_CIRCUMFERENCE}`}
            strokeOpacity={0.9}
          />
        </g>
      )}

      {phase === 'complete' && (
        <path
          d={`M ${cx - 7} ${cy} l 5 5 l 9 -10`}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {phase === 'error' && (
        <path
          d={`M ${cx - 5} ${cy - 5} l 10 10 M ${cx + 5} ${cy - 5} l -10 10`}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}
      {phase === 'pending' && (
        <circle cx={cx} cy={cy} r={3.5} fill="rgb(100 116 139)" />
      )}

      <text x={node.x + 62} y={node.y + 26} fontSize={13} fontWeight={600} fill="#e2e8f0">
        {clip(node.name, 18)}
      </text>
      <text x={node.x + 62} y={node.y + 44} fontSize={11} fill={color}>
        {PHASE_LABELS[phase]}
      </text>
      <text x={node.x + 62} y={node.y + 60} fontSize={10} fill="#64748b">
        {clip(subtitle, 24)}
      </text>

      {/* Per-VM progress bar */}
      <rect x={node.x + 62} y={node.y + 68} width={node.width - 78} height={4} rx={2} fill="rgb(51 65 85)" />
      <rect
        x={node.x + 62}
        y={node.y + 68}
        width={((node.width - 78) * progress) / 100}
        height={4}
        rx={2}
        fill={color}
        style={{ transition: 'width 400ms ease' }}
      />
    </g>
  );
}

// Minimal ANSI SGR parser for rendering terminal-style output in React.
// Handles standard/bright 8-color fg+bg, 256-color, truecolor, bold/dim/italic/underline,
// collapses \r carriage returns within a line (for progress bars), and strips
// non-SGR escape sequences (cursor movement, erase, OSC titles, etc.).

import type { CSSProperties } from 'react';

export interface AnsiSegment {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const FG: Record<number, string> = {
  0: '#1e293b', 1: '#f87171', 2: '#4ade80', 3: '#facc15',
  4: '#60a5fa', 5: '#c084fc', 6: '#22d3ee', 7: '#e2e8f0',
};
const BRIGHT_FG: Record<number, string> = {
  0: '#475569', 1: '#fca5a5', 2: '#86efac', 3: '#fde047',
  4: '#93c5fd', 5: '#d8b4fe', 6: '#67e8f9', 7: '#f8fafc',
};
const BG: Record<number, string> = {
  0: '#0f172a', 1: '#7f1d1d', 2: '#14532d', 3: '#713f12',
  4: '#1e3a8a', 5: '#581c87', 6: '#155e75', 7: '#cbd5e1',
};
const BRIGHT_BG: Record<number, string> = {
  0: '#1e293b', 1: '#991b1b', 2: '#166534', 3: '#854d0e',
  4: '#1e40af', 5: '#6b21a8', 6: '#0e7490', 7: '#f1f5f9',
};

function color256(n: number): string {
  if (n < 8) return FG[n];
  if (n < 16) return BRIGHT_FG[n - 8];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    const hex = Math.min(255, v).toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
  const c = n - 16;
  const r = Math.floor(c / 36);
  const g = Math.floor((c % 36) / 6);
  const b = c % 6;
  const steps = [0, 95, 135, 175, 215, 255];
  const toHex = (v: number) => steps[v].toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

type State = Omit<AnsiSegment, 'text'>;

function applySgr(state: State, codes: number[]): State {
  const out: State = { ...state };
  let i = 0;
  while (i < codes.length) {
    const c = codes[i++];
    if (c === 0) {
      delete out.fg; delete out.bg;
      out.bold = false; out.dim = false; out.italic = false; out.underline = false;
    } else if (c === 1) out.bold = true;
    else if (c === 2) out.dim = true;
    else if (c === 3) out.italic = true;
    else if (c === 4) out.underline = true;
    else if (c === 22) { out.bold = false; out.dim = false; }
    else if (c === 23) out.italic = false;
    else if (c === 24) out.underline = false;
    else if (c >= 30 && c <= 37) out.fg = FG[c - 30];
    else if (c === 38) {
      if (codes[i] === 5 && codes[i + 1] !== undefined) {
        out.fg = color256(codes[i + 1]); i += 2;
      } else if (codes[i] === 2 && codes[i + 3] !== undefined) {
        out.fg = `rgb(${codes[i + 1]},${codes[i + 2]},${codes[i + 3]})`; i += 4;
      }
    }
    else if (c === 39) delete out.fg;
    else if (c >= 40 && c <= 47) out.bg = BG[c - 40];
    else if (c === 48) {
      if (codes[i] === 5 && codes[i + 1] !== undefined) {
        out.bg = color256(codes[i + 1]); i += 2;
      } else if (codes[i] === 2 && codes[i + 3] !== undefined) {
        out.bg = `rgb(${codes[i + 1]},${codes[i + 2]},${codes[i + 3]})`; i += 4;
      }
    }
    else if (c === 49) delete out.bg;
    else if (c >= 90 && c <= 97) out.fg = BRIGHT_FG[c - 90];
    else if (c >= 100 && c <= 107) out.bg = BRIGHT_BG[c - 100];
  }
  return out;
}

// Collapse \r within each line so progress bars overwrite themselves instead
// of stacking. A \r without a following \n rewinds the current line.
function collapseCarriageReturns(input: string): string {
  return input.split('\n').map((line) => {
    const parts = line.split('\r');
    return parts[parts.length - 1];
  }).join('\n');
}

// Strip non-SGR escape sequences (cursor ops, erase, OSC titles/hyperlinks,
// charset designation, single-char ESC commands). SGR (ending in "m") is kept.
function stripNonSgrEscapes(input: string): string {
  let out = input.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
  out = out.replace(/\x1b\[[0-9;?]*[A-Za-ln-~]/g, '');
  out = out.replace(/\x1b[()][\x20-\x7e]/g, '');
  out = out.replace(/\x1b[=>cDEHM78]/g, '');
  return out;
}

export function parseAnsi(input: string): AnsiSegment[] {
  const text = stripNonSgrEscapes(collapseCarriageReturns(input));
  const segments: AnsiSegment[] = [];
  const re = /\x1b\[([0-9;]*)m/g;
  let state: State = {};
  let pos = 0;
  let match: RegExpExecArray | null;

  const push = (s: string) => {
    if (!s) return;
    segments.push({ text: s, ...state });
  };

  while ((match = re.exec(text)) !== null) {
    if (match.index > pos) push(text.slice(pos, match.index));
    const params = match[1];
    const codes = params === '' ? [0] : params.split(';').map((s) => parseInt(s, 10) || 0);
    state = applySgr(state, codes);
    pos = match.index + match[0].length;
  }
  if (pos < text.length) push(text.slice(pos));
  return segments;
}

export function segmentStyle(seg: AnsiSegment): CSSProperties {
  const style: CSSProperties = {};
  if (seg.fg) style.color = seg.fg;
  if (seg.bg) style.backgroundColor = seg.bg;
  if (seg.bold) style.fontWeight = 700;
  if (seg.dim) style.opacity = 0.7;
  if (seg.italic) style.fontStyle = 'italic';
  if (seg.underline) style.textDecoration = 'underline';
  return style;
}

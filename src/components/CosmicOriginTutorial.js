import React, { useEffect, useState, useMemo } from 'react';

// ---- power spectrum helpers (fast proxy) ----
const SCALES = [1, 2, 3, 4, 6, 8, 12]; // blur radii ~ “ell” increases to the right

function normalize01(arr) {
  if (!arr || arr.length === 0) return [];
  const lo = Math.min(...arr), hi = Math.max(...arr);
  if (hi - lo < 1e-9) return arr.map(() => 0);
  return arr.map(v => (v - lo) / (hi - lo));
}

function blurAtRadius(src, r) {
  if (r <= 0) return src.map(row => [...row]);
  const w = src.length, h = src[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  const d = 2 * r + 1, area = d * d;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      let sum = 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = Math.min(w - 1, Math.max(0, i + dx));
          const y = Math.min(h - 1, Math.max(0, j + dy));
          sum += src[x][y];
        }
      }
      out[i][j] = sum / area;
    }
  }
  return out;
}

function variance2D(arr) {
  const w = arr.length, h = arr[0].length;
  let sum = 0, sum2 = 0, n = w * h;
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
    const v = arr[i][j];
    sum += v; sum2 += v * v;
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

// simple two-line SVG chart (blue=current, gray dashed=target)
function SpectrumChart({ current, target, labels, width = 360, height = 160 }) {
  const pad = 28, w = width - 2 * pad, h = height - 2 * pad;
  const n = Math.max(current?.length || 0, target?.length || 0);
  const x = (i) => pad + (i / Math.max(1, n - 1)) * w;
  const y = (v) => pad + (1 - v) * h;
  const path = (data) =>
    (data || []).map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');

  return (
    <svg width={width} height={height}>
      <line x1={pad} y1={pad} x2={pad} y2={pad + h} stroke="#9CA3AF" />
      <line x1={pad} y1={pad + h} x2={pad + w} y2={pad + h} stroke="#9CA3AF" />
      {target && target.length > 0 && (
        <path d={path(target)} fill="none" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="4 4" />
      )}
      {current && current.length > 0 && (
        <path d={path(current)} fill="none" stroke="#3B82F6" strokeWidth="2" />
      )}
      <text x={pad} y={16} fontSize="12" fill="#111827">
        Power Spectrum — blue: current, gray: WMAP target
      </text>
      {labels && labels.length > 0 && (() => {
        const ticks = labels; // already sparse
        return ticks.map((lab, k) => {
          const i = Math.round((k * (n - 1)) / Math.max(1, ticks.length - 1));
          return (
            <text
              key={k}
              x={x(i)}
              y={pad + h + 14}
              fontSize="10"
              textAnchor="middle"
              fill="#6B7280"
            >
              {lab}
            </text>
          );
        });
      })()}
    </svg>
  );
}

function resampleToLength(arr, L) {
  // linear resample [0..N-1] -> [0..L-1]
  const N = arr.length;
  if (N === 0 || L === 0) return Array(L).fill(0);
  const out = [];
  for (let i = 0; i < L; i++) {
    const x = (i * (N - 1)) / (L - 1);
    const i0 = Math.floor(x), i1 = Math.min(N - 1, i0 + 1);
    const t = x - i0;
    out.push(arr[i0] * (1 - t) + arr[i1] * t);
  }
  return out;
}

function pickTicks(ellArray, maxTicks = 8) {
  if (!ellArray || ellArray.length === 0) return [];
  if (ellArray.length <= maxTicks) return ellArray;
  const step = Math.floor(ellArray.length / (maxTicks - 1));
  const ticks = [];
  for (let i = 0; i < ellArray.length; i += step) ticks.push(ellArray[i]);
  if (ticks[ticks.length - 1] !== ellArray[ellArray.length - 1]) {
    ticks.push(ellArray[ellArray.length - 1]);
  }
  return ticks;
}


export default function CosmicOriginTutorial({ onRestart }) {
  const [targetSpectrum, setTargetSpectrum] = useState([]);
    
  // Load target WMAP spectrum once on mount
  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/wmap_tt_binned.json`)
      .then((r) => r.json())
      .then(setTargetSpectrum);
  }, []);
    
  const GRID_SIZE = 64;
  const MAX_TEMP = 10;
  const MIN_TEMP = -3;

  const [grid, setGrid] = useState(
    Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => MIN_TEMP)
    )
  );

  const [cosmicTime, setCosmicTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(1);

  // ---- derive current spectrum from grid state ----
  const currentSpectrum = useMemo(() => {
    const vals = SCALES.map((r) => variance2D(blurAtRadius(grid, r)));
    return normalize01(vals);
  }, [grid]);
    
  //derived spectrum values
  // prepare target spectrum and sparse ticks
  const sorted = [...targetSpectrum].sort((a,b) => (a.ell ?? a.l) - (b.ell ?? b.l));
  const targetEll = sorted.map(d => d.ell ?? d.l);
  const targetCl  = normalize01(sorted.map(d => d.cl ?? d.CL ?? d.Cl ?? 0));
  const tickLabels = pickTicks(targetEll, 7); // show ~7 ticks
    
  // Universe age ticking
  useEffect(() => {
    const timer = setInterval(() => {
      setCosmicTime((prev) => prev + timeSpeed);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeSpeed]);

  // Spreading ripple evolution
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setGrid((prev) => {
        const next = prev.map((r) => [...r]);

        for (let i = 0; i < GRID_SIZE; i++) {
          for (let j = 0; j < GRID_SIZE; j++) {
            const val = prev[i][j];

            if (val >= 1.5) {
              for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                  const x = i + dx;
                  const y = j + dy;
                  const dist = Math.abs(dx) + Math.abs(dy);
                  if (
                    (dx !== 0 || dy !== 0) &&
                    x >= 0 && x < GRID_SIZE &&
                    y >= 0 && y < GRID_SIZE
                  ) {
                    const spread = val - dist * 0.3;
                    next[x][y] = Math.max(next[x][y], spread);
                  }
                }
              }
            }
          }
        }

        return next;
      });
    }, 300 / timeSpeed);

    return () => clearInterval(interval);
  }, [isRunning, timeSpeed]);

  // Inject filled ripple hotspot
  const handleCellClick = (row, col) => {
    const newGrid = grid.map((r) => [...r]);

    const ripplePattern = [
      { dist: 0, temp: MAX_TEMP },
      { dist: 1, temp: 6 },
      { dist: 2, temp: 4 },
      { dist: 3, temp: 2 },
    ];

    ripplePattern.forEach(({ dist, temp }, stepIndex) => {
      for (let dx = -dist; dx <= dist; dx++) {
        for (let dy = -dist; dy <= dist; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= dist) {
            const x = row + dx;
            const y = col + dy;
            if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
              newGrid[x][y] = Math.max(newGrid[x][y], temp);
            }
          }
        }
      }
    });

    setGrid(newGrid);
  };

  // Color map using clamped HSL
  const getColor = (temp) => {
    const clamped = Math.max(MIN_TEMP, Math.min(MAX_TEMP, temp));
    const norm = (clamped - MIN_TEMP) / (MAX_TEMP - MIN_TEMP);
    const hue = 240 - norm * 240;
    const lightness = 50 + (norm - 0.5) * 20;
    return `hsl(${hue}, 100%, ${lightness}%)`;
  };

  return (
    <div className="p-4 text-center">
      <h1 className="text-2xl font-bold mb-2">Level 1: Cosmic Origins</h1>
      <p className="text-gray-600 mb-2">
        Paint quantum fluctuations and watch heat ripple outward.
      </p>
      <p className="text-blue-500 font-mono text-lg mb-4">
        Universe Age: {cosmicTime} Myr
      </p>

      {/* Grid */}
      <div className="overflow-auto border border-gray-700 mx-auto" style={{ maxHeight: '80vh' }}>
        <div
          className="grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            width: 'min(100%, 800px)',
          }}
        >
          {grid.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  backgroundColor: getColor(cell),
                  transition: 'background-color 0.3s ease',
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Power Spectrum Panel */}
      <div className="mt-6 max-w-3xl mx-auto">
        <div className="rounded-lg shadow-sm border border-gray-200 p-3">
          <h2 className="text-lg font-semibold mb-2">Power Spectrum</h2>
          <p className="text-xs text-gray-500 mb-2">
            Blue = Your simulation · Gray = WMAP target (shown for guidance; official check at ~380k years)
          </p>

         <SpectrumChart
           current={currentSpectrum}
           target={targetCl}
           labels={tickLabels}
        />

          <ul className="mt-3 text-xs text-gray-600 list-disc list-inside">
            <li>Left ≈ large angular scales (low ℓ)</li>
            <li>Right ≈ small angular scales (high ℓ)</li>
          </ul>
        </div>
      </div>


      {/* Controls */}
      <div className="mt-6 flex justify-center gap-4 flex-wrap">
        <button
          onClick={() => setIsRunning(true)}
          className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Run Simulation
        </button>

        <button
          onClick={() => setTimeSpeed((prev) => (prev >= 8 ? 1 : prev * 2))}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Speed: {timeSpeed}×
        </button>

        <button
          onClick={onRestart}
          className="px-6 py-2 bg-gray-700 text-white rounded hover:bg-gray-800"
        >
          Restart
        </button>
      </div>
    </div>
  );
}


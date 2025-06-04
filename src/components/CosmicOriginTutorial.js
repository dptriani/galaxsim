import React, { useEffect, useState } from 'react';

export default function CosmicOriginTutorial({ onRestart }) {
  const GRID_SIZE = 64;
  const MAX_TEMP = 10;
  const MIN_TEMP = -3;

  const [cosmicTime, setCosmicTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(1);

  const [grid, setGrid] = useState(
    Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => MIN_TEMP)
    )
  );

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


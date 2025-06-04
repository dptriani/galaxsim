import React, { useEffect, useState } from 'react';

export default function CosmicOriginTutorial() {
  const [cosmicTime, setCosmicTime] = useState(0); // in Myr
  const [inflation, setInflation] = useState(5);
  const [grid, setGrid] = useState(
  Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => 0)  // Initial temp = 0
  )
  );
  // ✅ Put the new handleCellClick function right here:
  function handleCellClick(row, col) {
    const newGrid = grid.map((r, i) =>
      r.map((cell, j) => {
        if (i === row && j === col) {
          let next = cell + 1;
          if (next > 3) next = -3;
          return next;
        }
        return cell;
      })
    );
    setGrid(newGrid);
  }
  const toggleCell = (row, col) => {
  const newGrid = grid.map((r, i) =>
    r.map((cell, j) => {
      if (i === row && j === col) {
        let next = cell + 1;
        if (next > 3) next = -3; // Wrap around
        return next;
      }
      return cell;
    })
  );
  setGrid(newGrid);
  };

  const getColor = (temp) => {
  switch (temp) {
    case -3: return "bg-blue-900";
    case -2: return "bg-blue-700";
    case -1: return "bg-blue-400";
    case 0:  return "bg-blue-200";
    case 1:  return "bg-orange-300";
    case 2:  return "bg-red-400";
    case 3:  return "bg-red-600";
    default: return "bg-gray-300";
  }
  };

  // Idle-style time counter
  useEffect(() => {
    const timer = setInterval(() => {
      setCosmicTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function generateInitialGrid(size) {
    return Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 0)
    );
  }

  function handleCellClick(row, col) {
    const newGrid = grid.map((r, i) =>
      r.map((cell, j) => (i === row && j === col ? 1 - cell : cell))
    );
    setGrid(newGrid);
  }

  function handleRunSimulation() {
    alert("🚀 Simulating early structure... (This can later animate density waves!)");
  }

  return (
    <div className="p-6 text-center">
      <h1 className="text-3xl font-bold mb-4">Level 1: Cosmic Origins</h1>
      <p className="mb-4 text-gray-600">
        Paint quantum fluctuations and adjust inflation to shape the early Universe.
      </p>

      <p className="text-blue-500 font-mono mb-6">
        Universe Age: {cosmicTime} Myr
      </p>

      {/* Grid */}
      <div className="inline-block mb-6">
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="flex space-x-1">
            {row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
		className={`w-10 h-10 border border-white cursor-pointer ${getColor(cell)}`}
              ></div>
            ))}
          </div>
        ))}
      </div>

      {/* Inflation slider */}
      <div className="mb-6">
        <label className="block mb-1 font-medium text-gray-700">Inflation Strength: {inflation}</label>
        <input
          type="range"
          min="1"
          max="10"
          value={inflation}
          onChange={(e) => setInflation(e.target.value)}
          className="w-64"
        />
      </div>

      {/* Run Simulation */}
      <button
        onClick={handleRunSimulation}
        className="mt-4 px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
      >
        Run Simulation
      </button>
    </div>
  );
}


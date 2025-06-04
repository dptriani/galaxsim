import React, { useState } from 'react';

export default function Grid() {
  const [grid, setGrid] = useState(
    Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0))
  );

  const toggleCell = (row, col) => {
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

  return (
    <div className="flex flex-col items-center space-y-1">
      {grid.map((row, rowIndex) => (
        <div key={rowIndex} className="flex space-x-1">
          {row.map((cell, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              onClick={() => toggleCell(rowIndex, colIndex)}
              className={`w-10 h-10 border border-white cursor-pointer ${getColor(cell)}`}
            ></div>
          ))}
        </div>
      ))}
    </div>
  );
}


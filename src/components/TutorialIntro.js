import React from 'react';

export default function TutorialIntro({ onNext }) {
  return (
    <div className="p-6 text-center">
      <h1 className="text-4xl font-bold mb-6">Welcome to GalaxSim!</h1>
      <p className="text-lg mb-6">
        Build the Universe from cosmic origins to habitable planets.
      </p>

      {/* Clickable Level 1 */}
      <div
        onClick={onNext}
        className="cursor-pointer bg-gradient-to-br from-indigo-900 to-blue-700 p-6 rounded-xl shadow-xl max-w-md mx-auto hover:scale-105 transform transition"
      >
        <img
          src="https://github.com/dptriani/galaxsim/blob/main/public/level1.png"
          alt="Level 1: The Early Universe"
          className="rounded-lg shadow-md w-full mb-4"
        />
        <h2 className="text-white text-2xl font-bold">Click to Begin</h2>
      </div>
    </div>
  );
}


import React, { useState } from 'react';
import TutorialIntro from './components/TutorialIntro';
import CosmicOriginTutorial from './components/CosmicOriginTutorial';

function App() {
  const [step, setStep] = useState('intro');

  return (
    <div className="App">
      {step === 'intro' && <TutorialIntro onNext={() => setStep('cosmic-origin')} />}
      {step === 'cosmic-origin' && <CosmicOriginTutorial />}
    </div>
  );
}

export default App;


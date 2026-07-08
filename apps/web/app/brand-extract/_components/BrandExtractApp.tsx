"use client";

import { useState } from 'react';
import { BRANDS } from './data';
import Header from './components/Header';
import AccessModal from './components/AccessModal';
import BrandExtractionStudio from './components/BrandExtractionStudio';

export default function App() {
  const [activeBrand, setActiveBrand] = useState(BRANDS[0]);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

  const handleSelectBrand = (brand: typeof BRANDS[0]) => {
    setActiveBrand(brand);
  };

  return (
    <div className="relative min-h-screen bg-[#050507] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans select-none selection:bg-white/10 selection:text-white" id="sakhaa-forge-app">
      
      {/* Absolute background starry subtle overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.05),rgba(255,255,255,0))] pointer-events-none" />

      {/* Persistent Premium Header */}
      <Header
        brands={BRANDS}
        activeBrand={activeBrand}
        onSelectBrand={handleSelectBrand}
        onRequestAccess={() => setIsAccessModalOpen(true)}
      />

      {/* Main Dynamic Viewport Container */}
      <main className="flex-1 w-full flex flex-col justify-start py-6 md:py-10 relative overflow-hidden" id="main-workflow-viewport">
        <div className="w-full max-w-7xl mx-auto px-6">
          <BrandExtractionStudio
            activeBrand={activeBrand}
            onUpdateBrandData={(updated) => {
              setActiveBrand(updated);
            }}
            onProceedWorkflow={() => {
              setIsAccessModalOpen(true);
            }}
          />
        </div>
      </main>

      {/* Dedicated Interactive Walkthrough Booking / Access Modal Overlay */}
      <AccessModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        activeBrand={activeBrand}
      />
    </div>
  );
}

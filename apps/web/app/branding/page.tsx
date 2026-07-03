'use client';

import { useState } from 'react';
import Header from '../../src/components/Header';
import BrandIntakeSection from '../../src/components/BrandIntakeSection';
import AccessModal from '../../src/components/AccessModal';
import { BRANDS } from '../../src/data';

export default function BrandingPage() {
  const [activeBrand, setActiveBrand] = useState(BRANDS[0]);
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

  return (
    <div
      className="relative h-screen bg-[#050507] text-zinc-100 flex flex-col overflow-hidden font-sans select-none selection:bg-white/10 selection:text-white"
      id="sakhaa-forge-branding"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.05),rgba(255,255,255,0))] pointer-events-none" />

      <Header
        brands={BRANDS}
        activeBrand={activeBrand}
        onSelectBrand={setActiveBrand}
        onRequestAccess={() => setIsAccessModalOpen(true)}
      />

      <BrandIntakeSection brand={activeBrand} />

      <AccessModal
        isOpen={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        activeBrand={activeBrand}
      />
    </div>
  );
}

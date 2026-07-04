import React, { useEffect } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface PageWrapperProps {
  title: string;
  children: React.ReactNode;
}

import Particles from '@/components/common/Particles';

export default function PageWrapper({ title, children }: PageWrapperProps) {
  useEffect(() => {
    document.title = `${title} | CarbonTrack Portal`;
  }, [title]);

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden">
      {/* Particles Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-50">
        <Particles
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleColors={["#ffffff", "#ffffff", "#ffffff"]}
          moveParticlesOnHover={true}
          particleHoverFactor={2}
          alphaParticles={true}
          particleBaseSize={160}
          sizeRandomness={1.5}
          cameraDistance={20}
          disableRotation={false}
          className="w-full h-full"
        />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen w-full">
        <Navbar />
        <main className="flex-1 pt-16">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

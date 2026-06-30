import React, { useEffect } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

interface PageWrapperProps {
  title: string;
  children: React.ReactNode;
}

export default function PageWrapper({ title, children }: PageWrapperProps) {
  useEffect(() => {
    document.title = `${title} | IIT BHU Carbon Portal`;
  }, [title]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 pt-16">{children}</main>
      <Footer />
    </div>
  );
}

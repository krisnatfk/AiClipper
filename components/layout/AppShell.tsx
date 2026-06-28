'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import MobileSidebarDrawer from './MobileSidebarDrawer';
import TopHeader from './TopHeader';

export interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Desktop Sidebar - Hidden on mobile */}
      <Sidebar className="hidden lg:flex" />

      {/* Mobile Sidebar Drawer */}
      <MobileSidebarDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <TopHeader onMenuClick={() => setMobileMenuOpen(true)} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

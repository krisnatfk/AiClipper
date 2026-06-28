'use client';

import { Menu, Search, Bell, User } from 'lucide-react';

export interface TopHeaderProps {
  onMenuClick: () => void;
}

export default function TopHeader({ onMenuClick }: TopHeaderProps) {
  return (
    <header className="h-16 bg-sidebar/80 backdrop-blur-sm border-b border-border sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Hamburger Menu - Mobile/Tablet Only */}
        <button
          onClick={onMenuClick}
          className="p-2 text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search Bar - Hidden on Mobile */}
        <div className="hidden md:flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-64 xl:w-96">
          <Search className="w-4 h-4 text-secondary flex-shrink-0" />
          <input
            type="text"
            placeholder="Search projects, clips..."
            className="w-full bg-transparent text-sm text-primary placeholder:text-secondary focus:outline-none"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Search Icon - Mobile Only */}
        <button
          className="md:hidden p-2 text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button
          className="relative p-2 text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {/* Notification Badge */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
        </button>

        {/* User Menu */}
        <button
          className="flex items-center gap-2 p-2 text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors"
          aria-label="User menu"
        >
          <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-accent" />
          </div>
          <span className="hidden lg:inline text-sm font-medium text-primary">
            User
          </span>
        </button>
      </div>
    </header>
  );
}

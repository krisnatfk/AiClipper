'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Home,
  FolderOpen,
  Film,
  Palette,
  FileText,
  Settings,
  Zap,
  X,
} from 'lucide-react';
import { useEffect } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Create', href: '/', icon: Home },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Clips', href: '/clips', icon: Film },
  { name: 'Brand Templates', href: '/brand-templates', icon: Palette },
  { name: 'API Logs', href: '/api-logs', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileSidebarDrawer({
  open,
  onClose,
}: MobileSidebarDrawerProps) {
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    if (open) {
      onClose();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 w-72 bg-sidebar border-r border-border z-50 flex flex-col transform transition-transform duration-300 ease-in-out lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-border">
          <Link href="/" className="flex items-center gap-2" onClick={onClose}>
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-primary">
              AutoClip AI
            </span>
          </Link>

          <button
            onClick={onClose}
            className="p-2 text-secondary hover:text-primary hover:bg-hover rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-accent text-white'
                    : 'text-secondary hover:text-primary hover:bg-hover'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-4 border-t border-border">
          <div className="bg-card rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-secondary">API Status</span>
              <span className="text-success">Connected</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-secondary">Credits</span>
              <span className="text-primary font-medium">--</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

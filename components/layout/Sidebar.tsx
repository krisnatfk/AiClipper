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
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Create', href: '/', icon: Home },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'Clips', href: '/clips', icon: Film },
  { name: 'Templates', href: '/templates', icon: Palette },
  { name: 'Processing Logs', href: '/api-logs', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'w-64 bg-sidebar border-r border-border flex flex-col',
        className
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-primary group-hover:text-accent transition-colors">
            AutoClip AI
          </span>
        </Link>
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
            <span className="text-secondary">AI Engine</span>
            <span className="text-success">Local</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary">Queue</span>
            <span className="text-primary font-medium">Database</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import type { BrandTemplate } from '@/types';
import { Palette, RefreshCw, Check } from 'lucide-react';

export default function BrandTemplatesPage() {
  const [templates, setTemplates] = useState<BrandTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/brand-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setError('');

      const response = await fetch('/api/brand-templates/sync', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to sync templates');
      }

      // Refresh templates after sync
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-primary mb-2">
                Brand Templates
              </h1>
              <p className="text-sm text-secondary">
                Manage your OpusClip brand templates for consistent styling
              </p>
            </div>

            <Button
              variant="primary"
              onClick={handleSync}
              loading={syncing}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {syncing ? 'Syncing...' : 'Sync Templates'}
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-alert/10 border border-alert/20 rounded-lg p-4 text-sm text-alert">
              {error}
            </div>
          )}

          {/* Templates Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card p-6 animate-pulse">
                  <div className="h-32 bg-sidebar rounded mb-4" />
                  <div className="h-4 bg-sidebar rounded w-3/4 mb-2" />
                  <div className="h-3 bg-sidebar rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : templates.length > 0 ? (
            <>
              <div className="text-sm text-secondary mb-2">
                {templates.length} template{templates.length !== 1 ? 's' : ''} available
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="card p-6 space-y-4 relative"
                  >
                    {/* Default Badge */}
                    {template.is_default && (
                      <div className="absolute top-3 right-3">
                        <Badge variant="success" className="flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Default
                        </Badge>
                      </div>
                    )}

                    {/* Template Preview */}
                    <div className="aspect-video bg-sidebar rounded-lg flex items-center justify-center">
                      <Palette className="w-12 h-12 text-secondary/30" />
                    </div>

                    {/* Template Info */}
                    <div>
                      <h3 className="text-base font-semibold text-primary mb-1 truncate">
                        {template.name || 'Unnamed Template'}
                      </h3>
                      <p className="text-xs text-secondary font-mono truncate">
                        {template.brand_template_id}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        variant={template.is_default ? 'secondary' : 'primary'}
                        size="sm"
                        className="flex-1"
                        disabled={template.is_default}
                      >
                        {template.is_default ? 'Active' : 'Set as Default'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Palette className="w-16 h-16" />}
              title="No brand templates"
              description="Click 'Sync Templates' to fetch your templates from OpusClip"
              action={
                <Button variant="primary" onClick={handleSync}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Templates
                </Button>
              }
            />
          )}

          {/* Info Card */}
          <div className="card p-6 bg-accent/5 border-accent/20">
            <h3 className="text-sm font-semibold text-primary mb-2">
              About Brand Templates
            </h3>
            <p className="text-sm text-secondary mb-3">
              Brand templates allow you to customize the style, fonts, colors, and branding
              of your generated clips. Create and manage templates in your OpusClip dashboard,
              then sync them here to use in your projects.
            </p>
            <a
              href="https://www.opus.pro/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent hover:text-blue-400 transition-colors"
            >
              Manage templates on OpusClip →
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

import AppShell from '@/components/layout/AppShell';
import Badge from '@/components/ui/Badge';
import { testConnection } from '@/lib/db';
import { Settings as SettingsIcon, Database, Zap, Package } from 'lucide-react';

async function getSettings() {
  // Test database connection
  const dbConnected = await testConnection();

  return {
    apiKey: process.env.OPUS_API_KEY ? '••••••••' : 'Not set',
    apiBaseUrl: process.env.OPUS_API_BASE_URL || 'https://api.opus.pro',
    orgId: process.env.OPUS_ORG_ID || 'Not set',
    databaseUrl: process.env.DATABASE_URL ? '••••••••' : 'Not set',
    dbConnected,
    appName: process.env.NEXT_PUBLIC_APP_NAME || 'AutoClip AI',
  };
}

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">Settings</h1>
            <p className="text-sm text-secondary">
              Application configuration and system status
            </p>
          </div>

          {/* API Configuration */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">
                  OpusClip API Configuration
                </h2>
                <p className="text-sm text-secondary">
                  Connection settings for OpusClip API
                </p>
              </div>
            </div>

            <div className="space-y-3 pl-13">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-primary">API Status</div>
                  <div className="text-xs text-secondary mt-0.5">
                    Connection to OpusClip API
                  </div>
                </div>
                <Badge variant={settings.apiKey !== 'Not set' ? 'success' : 'alert'}>
                  {settings.apiKey !== 'Not set' ? 'Connected' : 'Not Configured'}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-primary">API Key</div>
                  <div className="text-xs text-secondary mt-0.5">
                    OPUS_API_KEY environment variable
                  </div>
                </div>
                <div className="text-sm text-secondary font-mono">
                  {settings.apiKey}
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-primary">Base URL</div>
                  <div className="text-xs text-secondary mt-0.5">
                    OpusClip API endpoint
                  </div>
                </div>
                <div className="text-sm text-secondary font-mono">
                  {settings.apiBaseUrl}
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-primary">Organization ID</div>
                  <div className="text-xs text-secondary mt-0.5">
                    OPUS_ORG_ID (optional)
                  </div>
                </div>
                <div className="text-sm text-secondary font-mono">
                  {settings.orgId}
                </div>
              </div>
            </div>
          </div>

          {/* Database Configuration */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">
                  Database Configuration
                </h2>
                <p className="text-sm text-secondary">
                  Turso database connection settings
                </p>
              </div>
            </div>

            <div className="space-y-3 pl-13">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-primary">Connection Status</div>
                  <div className="text-xs text-secondary mt-0.5">
                    Database connectivity check
                  </div>
                </div>
                <Badge variant={settings.dbConnected ? 'success' : 'alert'}>
                  {settings.dbConnected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-primary">Database URL</div>
                  <div className="text-xs text-secondary mt-0.5">
                    DATABASE_URL environment variable
                  </div>
                </div>
                <div className="text-sm text-secondary font-mono">
                  {settings.databaseUrl}
                </div>
              </div>
            </div>
          </div>

          {/* Application Info */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-energy/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-energy" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-primary">
                  Application Information
                </h2>
                <p className="text-sm text-secondary">
                  Version and system details
                </p>
              </div>
            </div>

            <div className="space-y-3 pl-13">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-primary">Application Name</div>
                </div>
                <div className="text-sm text-secondary">
                  {settings.appName}
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border">
                <div>
                  <div className="text-sm font-medium text-primary">Version</div>
                </div>
                <div className="text-sm text-secondary">
                  0.1.0
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-medium text-primary">Framework</div>
                </div>
                <div className="text-sm text-secondary">
                  Next.js 14 (App Router)
                </div>
              </div>
            </div>
          </div>

          {/* Help Card */}
          <div className="card p-6 bg-accent/5 border-accent/20">
            <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4" />
              Configuration Help
            </h3>
            <p className="text-sm text-secondary mb-3">
              To configure this application, create a <code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">.env</code> file
              in the project root with the following environment variables:
            </p>
            <ul className="text-sm text-secondary space-y-1 list-disc list-inside">
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">OPUS_API_KEY</code> - Your OpusClip API key</li>
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">DATABASE_URL</code> - Your Turso database URL</li>
              <li><code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">DATABASE_AUTH_TOKEN</code> - Your Turso auth token</li>
            </ul>
            <p className="text-sm text-secondary mt-3">
              See <code className="px-1.5 py-0.5 bg-sidebar rounded text-xs font-mono">.env.example</code> for a complete template.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

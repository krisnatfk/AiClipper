import AppShell from '@/components/layout/AppShell';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { db } from '@/lib/db';
import { apiLogs } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { formatDateTime } from '@/lib/utils';
import { FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

async function getApiLogs(limit: number = 50) {
  try {
    const logs = await db
      .select()
      .from(apiLogs)
      .orderBy(desc(apiLogs.created_at))
      .limit(limit);

    return logs;
  } catch (error) {
    console.error('Failed to fetch API logs:', error);
    return [];
  }
}

export default async function ApiLogsPage() {
  const logs = await getApiLogs();

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-primary mb-2">API Logs</h1>
            <p className="text-sm text-secondary">
              Monitor all OpusClip API requests and responses
            </p>
          </div>

          {/* Stats */}
          {logs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="text-2xl font-bold text-primary mb-1">
                  {logs.length}
                </div>
                <div className="text-xs text-secondary">Total Requests</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-success mb-1">
                  {logs.filter(l => l.status_code && l.status_code >= 200 && l.status_code < 300).length}
                </div>
                <div className="text-xs text-secondary">Successful</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-alert mb-1">
                  {logs.filter(l => l.status_code && l.status_code >= 400).length}
                </div>
                <div className="text-xs text-secondary">Errors</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-energy mb-1">
                  {logs.filter(l => !l.status_code).length}
                </div>
                <div className="text-xs text-secondary">Pending</div>
              </div>
            </div>
          )}

          {/* Logs Table */}
          {logs.length > 0 ? (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-sidebar border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Method
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Endpoint
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.map((log) => {
                      const statusCode = log.status_code;
                      const isSuccess = statusCode && statusCode >= 200 && statusCode < 300;
                      const isError = statusCode && statusCode >= 400;
                      const isPending = !statusCode;

                      return (
                        <tr key={log.id} className="hover:bg-hover transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isPending ? (
                              <Badge variant="energy" className="flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3 h-3" />
                                Pending
                              </Badge>
                            ) : isSuccess ? (
                              <Badge variant="success" className="flex items-center gap-1 w-fit">
                                <CheckCircle className="w-3 h-3" />
                                {statusCode}
                              </Badge>
                            ) : isError ? (
                              <Badge variant="alert" className="flex items-center gap-1 w-fit">
                                <XCircle className="w-3 h-3" />
                                {statusCode}
                              </Badge>
                            ) : (
                              <Badge variant="default">{statusCode}</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-mono text-primary">
                              {log.method}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-primary font-mono truncate max-w-md">
                              {log.endpoint}
                            </div>
                            {log.error_message && (
                              <div className="text-xs text-alert mt-1 truncate max-w-md">
                                {log.error_message}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-secondary">
                              {formatDateTime(log.created_at)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<FileText className="w-16 h-16" />}
              title="No API logs yet"
              description="API requests and responses will be logged here automatically"
            />
          )}

          {/* Info */}
          {logs.length > 0 && (
            <div className="text-center text-sm text-secondary">
              Showing {logs.length} most recent API requests
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

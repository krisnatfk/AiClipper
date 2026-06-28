import AppShell from '@/components/layout/AppShell';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { db } from '@/lib/db';
import { apiLogs } from '@/lib/db/schema';
import { desc, like, sql } from 'drizzle-orm';
import { formatDateTime } from '@/lib/utils';
import { FileText, CheckCircle, XCircle, AlertTriangle, ArrowLeft, Filter } from 'lucide-react';

async function getApiLogs(projectId?: string, limit: number = 100) {
  try {
    let query = db
      .select()
      .from(apiLogs);

    // Filter by projectId if provided
    if (projectId) {
      query = query.where(
        sql`${apiLogs.endpoint} LIKE ${'%' + projectId + '%'}
          OR json_extract(${apiLogs.request_payload}, '$.videoUrl') LIKE ${'%' + projectId + '%'}`
      ) as any;
    }

    const logs = await query
      .orderBy(desc(apiLogs.created_at))
      .limit(limit);

    return logs;
  } catch (error) {
    console.error('Failed to fetch API logs:', error);
    return [];
  }
}

export default async function ApiLogsPage({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  const projectId = searchParams.projectId;
  const logs = await getApiLogs(projectId);

  const successCount = logs.filter(l => l.status_code && l.status_code >= 200 && l.status_code < 300).length;
  const errorCount = logs.filter(l => l.status_code && l.status_code >= 400).length;
  const pendingCount = logs.filter(l => !l.status_code).length;

  return (
    <AppShell>
      <div className="min-h-full bg-canvas p-4 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              {projectId && (
                <a href="/api-logs" className="text-secondary hover:text-primary transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </a>
              )}
              <h1 className="text-2xl font-bold text-primary">API Logs</h1>
            </div>
            <p className="text-sm text-secondary">
              Monitor all OpusClip API requests and responses
            </p>
          </div>

          {/* Project filter banner */}
          {projectId && (
            <div className="flex items-center gap-2 px-4 py-3 bg-accent/10 border border-accent/20 rounded-lg">
              <Filter className="w-4 h-4 text-accent" />
              <span className="text-sm text-primary">
                Filtered by project:{' '}
                <code className="font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {projectId}
                </code>
              </span>
              <a
                href="/api-logs"
                className="ml-auto text-xs text-secondary hover:text-primary transition-colors"
              >
                Clear filter
              </a>
            </div>
          )}

          {/* Stats */}
          {logs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card p-4">
                <div className="text-2xl font-bold text-primary mb-1">
                  {logs.length}
                </div>
                <div className="text-xs text-secondary">Total Requests</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-success mb-1">
                  {successCount}
                </div>
                <div className="text-xs text-secondary">Successful</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-alert mb-1">
                  {errorCount}
                </div>
                <div className="text-xs text-secondary">Errors</div>
              </div>
              <div className="card p-4">
                <div className="text-2xl font-bold text-energy mb-1">
                  {pendingCount}
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
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Method
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Endpoint
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
                        Error
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-secondary uppercase tracking-wider">
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
                          </td>
                          <td className="px-4 py-3">
                            {log.error_message ? (
                              <div className="text-xs text-alert truncate max-w-xs">
                                {log.error_message}
                              </div>
                            ) : (
                              <span className="text-xs text-secondary">—</span>
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
              title={projectId ? 'No logs for this project' : 'No API logs yet'}
              description={
                projectId
                  ? 'No API requests were found matching this project ID'
                  : 'API requests and responses will be logged here automatically'
              }
            />
          )}

          {/* Info */}
          {logs.length > 0 && (
            <div className="text-center text-sm text-secondary">
              Showing {logs.length} most recent API requests
              {projectId ? ` for project ${projectId}` : ''}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

import { db } from '@/lib/db';
import { apiLogs } from '@/lib/db/schema';
import type { CreateProjectPayload, OpusClipProject, OpusClip } from '@/types';

// Environment configuration
const OPUS_API_KEY = process.env.OPUS_API_KEY;
const OPUS_API_BASE_URL = process.env.OPUS_API_BASE_URL || 'https://api.opus.pro';
const OPUS_ORG_ID = process.env.OPUS_ORG_ID;

/**
 * OpusClip API Error
 */
export class OpusApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'OpusApiError';
  }
}

/**
 * Log API request and response to database
 */
async function logApiCall(
  endpoint: string,
  method: string,
  requestPayload: any,
  responsePayload: any,
  statusCode?: number,
  errorMessage?: string
): Promise<void> {
  try {
    await db.insert(apiLogs).values({
      endpoint,
      method,
      request_payload: requestPayload,
      response_payload: responsePayload,
      status_code: statusCode,
      error_message: errorMessage,
    });
  } catch (error) {
    console.error('Failed to log API call:', error);
  }
}

/**
 * Base API request function with error handling and logging
 */
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!OPUS_API_KEY) {
    throw new OpusApiError(
      'OPUS_API_KEY is not configured. OpusClip is available only in legacy mode and is not used by the default AutoClip AI engine.',
      undefined,
      endpoint
    );
  }

  const url = `${OPUS_API_BASE_URL}${endpoint}`;
  const method = options.method || 'GET';

  const headers: HeadersInit = {
    'Authorization': `Bearer ${OPUS_API_KEY}`,
    'Content-Type': 'application/json',
    ...(OPUS_ORG_ID && { 'x-opus-org-id': OPUS_ORG_ID }),
    ...options.headers,
  };

  const requestPayload = options.body ? JSON.parse(options.body as string) : null;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const responseText = await response.text();
    let responsePayload: any;

    try {
      responsePayload = responseText ? JSON.parse(responseText) : null;
    } catch {
      responsePayload = responseText;
    }

    // Log the API call
    await logApiCall(
      endpoint,
      method,
      requestPayload,
      responsePayload,
      response.status,
      response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
    );

    if (!response.ok) {
      throw new OpusApiError(
        responsePayload?.message || `API request failed: ${response.statusText}`,
        response.status,
        endpoint,
        responsePayload
      );
    }

    return responsePayload as T;
  } catch (error) {
    if (error instanceof OpusApiError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logApiCall(
      endpoint,
      method,
      requestPayload,
      null,
      undefined,
      errorMessage
    );

    throw new OpusApiError(
      `Network error: ${errorMessage}`,
      undefined,
      endpoint,
      error
    );
  }
}

/**
 * Create a new clip project
 * @param payload - Project creation payload
 * @returns Created project data
 */
function normalizeProjectResponse(response: any): OpusClipProject {
  if (Array.isArray(response)) {
    return response[0];
  }

  return response?.data || response?.project || response;
}

export async function createClipProject(
  payload: CreateProjectPayload
): Promise<OpusClipProject> {
  // Clean up payload - remove empty optional objects
  const cleanPayload: any = {
    videoUrl: payload.videoUrl,
  };

  if (payload.uploadedVideoAttr?.title) {
    cleanPayload.uploadedVideoAttr = payload.uploadedVideoAttr;
  }

  if (payload.curationPref) {
    cleanPayload.curationPref = { ...payload.curationPref };
    // Remove empty range
    if (
      cleanPayload.curationPref.range &&
      !cleanPayload.curationPref.range.startSec &&
      !cleanPayload.curationPref.range.endSec
    ) {
      delete cleanPayload.curationPref.range;
    }
  }

  if (payload.renderPref) {
    cleanPayload.renderPref = payload.renderPref;
  }

  if (payload.importPref) {
    cleanPayload.importPref = payload.importPref;
  }

  if (payload.brandTemplateId) {
    cleanPayload.brandTemplateId = payload.brandTemplateId;
  }

  if (payload.conclusionActions) {
    cleanPayload.conclusionActions = payload.conclusionActions;
  }

  const response = await apiRequest<OpusClipProject>('/api/clip-projects', {
    method: 'POST',
    body: JSON.stringify(cleanPayload),
  });

  return normalizeProjectResponse(response);
}

/**
 * Get clip project status from OpusClip.
 * Uses endpoint fallbacks because OpusClip docs differ between project lookups.
 */
export async function getClipProject(projectId: string): Promise<OpusClipProject> {
  const endpoints = [
    `/api/clip-projects/${projectId}`,
    `/api/clip-projects?q=findById&id=${encodeURIComponent(projectId)}`,
    `/api/clip-projects?q=findByProjectId&projectId=${encodeURIComponent(projectId)}`,
  ];

  let lastError: unknown;

  for (const endpoint of endpoints) {
    try {
      const response = await apiRequest<OpusClipProject>(endpoint);
      const project = normalizeProjectResponse(response);

      if (project?.id) {
        return project;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new OpusApiError('Failed to fetch project status', undefined, '/api/clip-projects');
}

/**
 * Get exportable clips from a project
 * @param projectId - Project ID
 * @param pageNum - Page number (default: 1)
 * @param pageSize - Page size (default: 50)
 * @returns Array of clips
 */
export async function getExportableClips(
  projectId: string,
  pageNum: number = 1,
  pageSize: number = 20
): Promise<OpusClip[]> {
  const params = new URLSearchParams({
    q: 'findByProjectId',
    projectId,
    pageNum: pageNum.toString(),
    pageSize: pageSize.toString(),
  });

  const response = await apiRequest<any>(
    `/api/exportable-clips?${params.toString()}`
  );

  return response?.data || response?.clips || (Array.isArray(response) ? response : []);
}

/**
 * Get brand templates
 * @returns Array of brand templates
 */
export async function getBrandTemplates(): Promise<any[]> {
  const params = new URLSearchParams({
    q: 'mine',
  });

  const response = await apiRequest<any[]>(
    `/api/brand-templates?${params.toString()}`
  );

  return response;
}

/**
 * Generate upload link for local video upload
 * @returns Upload URL and upload ID
 */
export async function generateUploadLink(): Promise<{
  url: string;
  uploadId: string;
}> {
  const response = await apiRequest<{ video: { url: string; uploadId: string } }>(
    '/api/upload-links',
    {
      method: 'POST',
      body: JSON.stringify({
        video: {
          usecase: 'LocalUpload',
        },
      }),
    }
  );

  return {
    url: response.video.url,
    uploadId: response.video.uploadId,
  };
}

/**
 * Create project from uploaded video
 * @param uploadId - Upload ID from generateUploadLink
 * @param payload - Project creation payload
 * @returns Created project data
 */
export async function createProjectFromUpload(
  uploadId: string,
  payload: Omit<CreateProjectPayload, 'videoUrl'>
): Promise<OpusClipProject> {
  const fullPayload: CreateProjectPayload = {
    ...payload,
    videoUrl: uploadId,
  };

  return createClipProject(fullPayload);
}

/**
 * Get transcript for a project
 * @param projectId - Project ID
 * @returns Transcript data
 */
export async function getTranscript(projectId: string): Promise<any> {
  const params = new URLSearchParams({
    q: 'findByProjectId',
    projectId,
  });

  const response = await apiRequest<any>(
    `/api/transcripts?${params.toString()}`
  );

  return response;
}

/**
 * Create a new collection
 * @param collectionName - Name of the collection
 * @returns Created collection data
 */
export async function createCollection(collectionName: string): Promise<any> {
  const response = await apiRequest<any>('/api/collections', {
    method: 'POST',
    body: JSON.stringify({
      collectionName,
    }),
  });

  return response;
}

/**
 * Get all collections
 * @returns Array of collections
 */
export async function getCollections(): Promise<any[]> {
  const response = await apiRequest<any[]>('/api/collections', {
    method: 'GET',
  });

  return response;
}

/**
 * Add clip to collection
 * @param collectionId - Collection ID
 * @param contentId - Content/Clip ID (bare clip ID, not full ID)
 * @returns Updated collection data
 */
export async function addClipToCollection(
  collectionId: string,
  contentId: string
): Promise<any> {
  const response = await apiRequest<any>(
    `/api/collections/${collectionId}/contents`,
    {
      method: 'POST',
      body: JSON.stringify({
        contentId,
      }),
    }
  );

  return response;
}

/**
 * Remove clip from collection
 * @param collectionId - Collection ID
 * @param contentId - Content/Clip ID
 * @returns Updated collection data
 */
export async function removeClipFromCollection(
  collectionId: string,
  contentId: string
): Promise<any> {
  const response = await apiRequest<any>(
    `/api/collections/${collectionId}/contents/${contentId}`,
    {
      method: 'DELETE',
    }
  );

  return response;
}

/**
 * Export clips from collection
 * @param collectionId - Collection ID
 * @returns Export data with URIs
 */
export async function exportCollection(collectionId: string): Promise<any> {
  const response = await apiRequest<any>(
    `/api/collections/${collectionId}/export`,
    {
      method: 'POST',
    }
  );

  return response;
}

/**
 * Get connected social media accounts
 * @returns Array of social accounts
 */
export async function getSocialAccounts(): Promise<any[]> {
  const response = await apiRequest<any[]>('/api/social-accounts', {
    method: 'GET',
  });

  return response;
}

/**
 * Create social copy generation job
 * @param payload - Job payload with clip IDs and preferences
 * @returns Job data with jobId
 */
export async function createSocialCopyJob(payload: {
  clipIds: string[];
  preferences?: any;
}): Promise<{ jobId: string }> {
  const response = await apiRequest<{ jobId: string }>(
    '/api/social-copy-jobs',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  return response;
}

/**
 * Get social copy job status and results
 * @param jobId - Job ID from createSocialCopyJob
 * @returns Job status and generated copy
 */
export async function getSocialCopyJob(jobId: string): Promise<any> {
  const response = await apiRequest<any>(`/api/social-copy-jobs/${jobId}`, {
    method: 'GET',
  });

  return response;
}

/**
 * Publish post immediately to social media
 * @param payload - Post payload with platform, account, clip, and content
 * @returns Publish result
 */
export async function publishPost(payload: {
  platform: string;
  accountId: string;
  clipId: string;
  title?: string;
  description?: string;
  hashtags?: string[];
}): Promise<any> {
  const response = await apiRequest<any>('/api/social-posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response;
}

/**
 * Schedule post for future publishing
 * @param payload - Schedule payload with platform, account, clip, content, and schedule time
 * @returns Schedule result with scheduleId
 */
export async function schedulePost(payload: {
  platform: string;
  accountId: string;
  clipId: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  scheduledAt: string; // ISO 8601 datetime
}): Promise<{ scheduleId: string }> {
  const response = await apiRequest<{ scheduleId: string }>(
    '/api/social-posts/schedule',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );

  return response;
}

/**
 * Cancel a scheduled post
 * @param scheduleId - Schedule ID from schedulePost
 * @returns Cancellation result
 */
export async function cancelScheduledPost(scheduleId: string): Promise<any> {
  const response = await apiRequest<any>(
    `/api/social-posts/schedule/${scheduleId}`,
    {
      method: 'DELETE',
    }
  );

  return response;
}

import { config } from './config.js';

export interface ApiKeyData {
  organization_id: string;
  organization: {
    id: string;
    name: string;
    plan: string;
  };
}

// Response from Edge Function
interface VerifyApiKeyResponse {
  success: boolean;
  organizationId: string;
  organizationName: string;
  plan: string;
}

// Edge Function URL
const EDGE_FUNCTION_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/verify-api-key';

// Normalize and validate API key input
function sanitizeApiKey(input: string): { ok: boolean; key?: string; message?: string } {
  const raw = (input || '').trim().toLowerCase();
  if (!raw.startsWith('lc_')) {
    return { ok: false, message: 'API key must start with lc_' };
  }
  const hex = raw.slice(3); // after lc_
  const hexOnly = hex.replace(/[^a-f0-9]/g, '');
  if (hexOnly.length !== 64) {
    return { ok: false, message: 'Invalid API key format. Expected lc_ followed by 64 hex characters' };
  }
  return { ok: true, key: `lc_${hexOnly}` };
}

/**
 * Verify API key via Edge Function
 */
export async function verifyApiKey(plainTextKey: string): Promise<ApiKeyData | null> {
  try {
    const sanitized = sanitizeApiKey(plainTextKey);
    if (!sanitized.ok || !sanitized.key) {
      return null;
    }

    // Call Edge Function
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey: sanitized.key })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as VerifyApiKeyResponse;

    if (!data.success) {
      return null;
    }

    // Map Edge Function response to ApiKeyData format
    return {
      organization_id: data.organizationId,
      organization: {
        id: data.organizationId,
        name: data.organizationName,
        plan: data.plan
      }
    };
  } catch (error) {
    console.error('Error verifying API key:', error);
    return null;
  }
}

/**
 * Authenticate and save credentials to config
 */
export async function authenticate(apiKey: string): Promise<{
  success: boolean;
  message: string;
  data?: ApiKeyData;
}> {
  const sanitized = sanitizeApiKey(apiKey);
  if (!sanitized.ok || !sanitized.key) {
    return {
      success: false,
      message: sanitized.message || 'Invalid API key format. Expected format: lc_[64 hex characters]'
    };
  }

  // Verify via Edge Function
  const keyData = await verifyApiKey(sanitized.key);

  if (!keyData) {
    return {
      success: false,
      message: 'Invalid or revoked API key. Please check your key and try again.'
    };
  }

  // Save to config
  config.set('apiKey', sanitized.key);
  config.set('organizationId', keyData.organization_id);
  config.set('organizationName', keyData.organization.name);

  return {
    success: true,
    message: `Successfully authenticated as ${keyData.organization.name}`,
    data: keyData
  };
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!(config.get('apiKey') && config.get('organizationId'));
}

/**
 * Get current organization ID
 */
export function getOrganizationId(): string | undefined {
  return config.get('organizationId');
}

/**
 * Get current API key
 */
export function getApiKey(): string | undefined {
  return config.get('apiKey');
}

/**
 * Logout (clear authentication)
 */
export function logout(): void {
  config.delete('apiKey');
  config.delete('organizationId');
  config.delete('organizationName');
  config.delete('defaultProject');
}

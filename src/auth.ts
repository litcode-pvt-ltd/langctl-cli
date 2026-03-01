import { config } from './config.js';
import { createApiClient } from './api.js';

export interface ApiKeyData {
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

// Response from POST /api-keys/validate
interface ValidateApiKeyResponse {
  valid: boolean;
  organizationId: string;
  scopes: string[];
}

// Response from GET /orgs/:orgId
interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

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
 * Verify API key via Fastify API
 */
export async function verifyApiKey(plainTextKey: string): Promise<ApiKeyData | null> {
  try {
    const sanitized = sanitizeApiKey(plainTextKey);
    if (!sanitized.ok || !sanitized.key) {
      return null;
    }

    // Create a temporary API client with the key to validate
    const client = createApiClient(sanitized.key);

    // Validate the API key
    const validateResult = await client.post<ValidateApiKeyResponse>('/api-keys/validate', {
      apiKey: sanitized.key,
    });

    if (!validateResult.valid) {
      return null;
    }

    // Fetch organization details
    const org = await client.get<OrganizationResponse>(`/orgs/${validateResult.organizationId}`);

    return {
      organizationId: validateResult.organizationId,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
      },
    };
  } catch (error) {
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
      message: sanitized.message || 'Invalid API key format. Expected format: lc_[64 hex characters]',
    };
  }

  // Verify via Fastify API
  const keyData = await verifyApiKey(sanitized.key);

  if (!keyData) {
    return {
      success: false,
      message: 'Invalid or revoked API key. Please check your key and try again.',
    };
  }

  // Save to config
  config.set('apiKey', sanitized.key);
  config.set('organizationId', keyData.organizationId);
  config.set('organizationName', keyData.organization.name);

  return {
    success: true,
    message: `Successfully authenticated as ${keyData.organization.name}`,
    data: keyData,
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

# Langctl CLI - Internal Working Instructions

**For Developers & AI Agents**

This document explains the internal architecture and working of the Langctl CLI. Use this to understand how each component works, how to extend functionality, and troubleshoot issues.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication System](#authentication-system)
3. [Edge Functions Integration](#edge-functions-integration)
4. [Command Structure](#command-structure)
5. [File Organization](#file-organization)
6. [How Each Command Works](#how-each-command-works)
7. [Configuration Management](#configuration-management)
8. [Error Handling](#error-handling)
9. [Testing & Deployment](#testing--deployment)
10. [Adding New Commands](#adding-new-commands)

---

## Architecture Overview

### Core Principles

1. **CLI-First Design**: Never expose Supabase credentials to users
2. **Edge Function Gateway**: All operations go through Supabase Edge Functions
3. **API Key Authentication**: Users authenticate with organization-scoped API keys
4. **Stateless Operations**: Each command is independent and self-contained

### Technology Stack

- **Commander.js**: CLI framework for command parsing and routing
- **Chalk**: Terminal string styling and colors
- **Ora**: Loading spinners for async operations
- **Node-fetch**: HTTP requests to Edge Functions
- **TypeScript**: Type safety and better DX

### Data Flow

```
User Command
    ↓
Commander.js (index.ts)
    ↓
Command Handler (commands/*.ts)
    ↓
Authentication Check (auth.ts)
    ↓
Edge Function Request (fetch)
    ↓
Edge Function (Supabase)
    ↓
Database Query/Mutation
    ↓
Response to CLI
    ↓
Formatted Output (chalk)
```

---

## Authentication System

### File: `src/auth.ts`

#### How API Keys Work

1. **Format**: `lc_[64 hex characters]` (67 chars total)
2. **Storage**: SHA-256 hash stored in database
3. **Validation**: Keys validated via `verify-api-key` Edge Function
4. **Local Storage**: Plain text key stored in `~/.langctl/config.json`

#### Key Functions

##### `sanitizeApiKey(input: string)`
```typescript
// Purpose: Validate and normalize API key format
// Input: User-provided API key (may have extra spaces, wrong case)
// Output: { ok: boolean, key?: string, message?: string }
// Logic:
//   1. Trim and lowercase
//   2. Check 'lc_' prefix
//   3. Extract hex part (everything after 'lc_')
//   4. Remove non-hex characters
//   5. Verify exactly 64 hex characters
```

##### `verifyApiKey(plainTextKey: string)`
```typescript
// Purpose: Verify API key with server
// Calls: verify-api-key Edge Function
// Returns: ApiKeyData | null
// Process:
//   1. Sanitize input key
//   2. POST to verify-api-key function
//   3. Parse response (organizationId, name, plan)
//   4. Return null if invalid
```

##### `authenticate(apiKey: string)`
```typescript
// Purpose: Full authentication flow
// Process:
//   1. Sanitize key
//   2. Verify with server
//   3. Save to config.json
//   4. Return success/failure
// Side Effects: Writes to ~/.langctl/config.json
```

##### `isAuthenticated()`
```typescript
// Purpose: Check if user has valid stored credentials
// Logic: Checks if apiKey and organizationId exist in config
// Note: Does NOT verify key validity with server
```

##### `getApiKey()` / `getOrganizationId()`
```typescript
// Purpose: Retrieve stored credentials
// Returns: string | undefined
```

##### `logout()`
```typescript
// Purpose: Clear all stored credentials
// Side Effects: Deletes apiKey, organizationId, organizationName, defaultProject from config
```

---

## Edge Functions Integration

### Base URL
All Edge Functions are at: `https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/`

### Authentication Pattern

Every Edge Function follows this pattern:

```typescript
const response = await fetch(EDGE_FUNCTION_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey  // User's API key
  },
  body: JSON.stringify({
    action: 'action-name',
    // ... other parameters
  })
});
```

### Edge Functions List

#### 1. `verify-api-key`
- **Purpose**: Validate API key and get organization info
- **Input**: `{ apiKey: string }`
- **Output**: `{ success: boolean, organizationId: string, organizationName: string, plan: string }`
- **Used By**: `auth.ts`

#### 2. `list-projects`
- **Purpose**: List all projects for authenticated organization
- **Input**: (none - uses X-API-Key header)
- **Output**: `{ success: boolean, projects: Project[] }`
- **Used By**: `projects.ts`

#### 3. `manage-projects`
- **Purpose**: CRUD operations on projects
- **Actions**:
  - `create`: Create new project
  - `get`: Get project details (NOT USED - use list-projects instead)
  - `update`: Update project
  - `delete`: Soft delete project
  - `add-language`: Add language to project
  - `remove-language`: Remove language from project
  - `stats`: Get project statistics
- **Used By**: `projects.ts`

#### 4. `manage-translation-keys`
- **Purpose**: CRUD operations on translation keys
- **Actions**:
  - `list`: List keys with filtering
  - `get`: Get single key details (NOT USED directly)
  - `create`: Create new key
  - `update`: Update key metadata (NOT USED)
  - `delete`: Delete key
  - `translate`: Update single language translation
  - `publish`: Bulk publish/unpublish keys
- **Used By**: `keys.ts`

#### 5. `manage-team-members`
- **Purpose**: Team member management
- **Actions**:
  - `list`: List team members
  - `get`: Get member details
  - `invite`: Invite new member
  - `remove`: Remove member
  - `update-role`: Update member role
  - `list-invitations`: List invitations
  - `revoke-invitation`: Revoke invitation
- **Used By**: `team.ts`

#### 6. `get-organization-info`
- **Purpose**: Organization information and statistics
- **Actions**:
  - `info`: Get org details
  - `stats`: Get org statistics
  - `plan`: Get subscription plan and limits
- **Used By**: `org.ts`

#### 7. `export-translations`
- **Purpose**: Export translations in various formats
- **Input**: `{ projectSlug: string, language?: string, format: string, module?: string, includeUnpublished: boolean }`
- **Output**: `{ success: boolean, translations: object/string, format: string }`
- **Used By**: `export.ts`

#### 8. `push-translations`
- **Purpose**: Import/push translations to server
- **Input**: `{ projectSlug: string, language: string, translations: object, overwrite: boolean, publish: boolean }`
- **Output**: `{ success: boolean, created: number, updated: number, skipped: number }`
- **Used By**: `import.ts`

---

## Command Structure

### File: `src/index.ts`

This is the main entry point that registers all commands using Commander.js.

#### Command Registration Pattern

```typescript
program
  .command('command-name <required> [optional]')
  .description('What this command does')
  .option('-f, --flag <value>', 'Flag description', 'default')
  .action(async (requiredArg, options) => {
    try {
      await commandFunction(requiredArg, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });
```

#### Subcommand Groups

Commands are organized into groups:

```typescript
const projects = program.command('projects').description('Manage projects');
projects.command('list').action(...);
projects.command('create <name>').action(...);

const keys = program.command('keys').description('Manage translation keys');
keys.command('list <project>').action(...);
keys.command('create <project> <key>').action(...);
```

---

## File Organization

```
langctl-cli/
├── src/
│   ├── index.ts              # Main entry point, command registration
│   ├── auth.ts               # Authentication utilities
│   ├── config.ts             # Configuration management
│   ├── commands/
│   │   ├── auth.ts           # Auth commands (init, logout)
│   │   ├── projects.ts       # Project CRUD commands
│   │   ├── keys.ts           # Translation key commands
│   │   ├── team.ts           # Team management commands
│   │   ├── org.ts            # Organization commands
│   │   ├── export.ts         # Export translations
│   │   ├── import.ts         # Import translations
│   │   ├── pull.ts           # Legacy pull command
│   │   ├── init.ts           # Interactive setup
│   │   ├── config.ts         # Config viewer
│   │   └── debug.ts          # Debug utilities
│   └── utils/
│       └── banner.ts         # CLI banner/logo
├── dist/                     # Compiled JavaScript
├── bin/
│   └── langctl.js           # Executable entry point
├── package.json
├── tsconfig.json
└── README.md
```

---

## How Each Command Works

### Authentication Commands

#### `langctl init`
**File**: `src/commands/init.ts`

```typescript
// Process:
1. Show welcome banner
2. Prompt for API key
3. Call authenticate() from auth.ts
4. Prompt for default language preference
5. Save to config
6. Show success message
```

#### `langctl auth <api-key>`
**File**: `src/commands/auth.ts`

```typescript
// Process:
1. Get API key from argument
2. Call authenticate() from auth.ts
3. authenticate() does:
   - Sanitize key
   - POST to verify-api-key Edge Function
   - Save to config on success
4. Show success/error message
```

#### `langctl logout`
**File**: `src/commands/auth.ts`

```typescript
// Process:
1. Call logout() from auth.ts
2. logout() deletes all keys from config
3. Show confirmation message
```

#### `langctl config`
**File**: `src/commands/config.ts`

```typescript
// Process:
1. Read config from ~/.langctl/config.json
2. Display masked API key (first 10 chars + ...)
3. Display organizationId, organizationName
4. Display config file path
```

---

### Organization Commands

#### `langctl org info`
**File**: `src/commands/org.ts`

```typescript
// Process:
1. Check authentication (isAuthenticated())
2. Get API key (getApiKey())
3. Start spinner
4. POST to get-organization-info with action: 'info'
5. Parse response
6. Display:
   - Organization name
   - ID and slug
   - Subscription plan
   - Creation date
```

#### `langctl org stats`
**File**: `src/commands/org.ts`

```typescript
// Process:
1. Check authentication
2. POST to get-organization-info with action: 'stats'
3. Parse response with stats:
   - members: number of team members
   - projects: number of projects
   - total_keys, published_keys, unpublished_keys
   - languages: count and codes
   - api_keys: active API keys
   - webhooks: active webhooks
4. Display formatted statistics
```

#### `langctl org plan`
**File**: `src/commands/org.ts`

```typescript
// Process:
1. Check authentication
2. POST to get-organization-info with action: 'plan'
3. Parse response with limits:
   - max_members
   - max_projects
   - max_keys_per_project
   - max_api_keys
4. Format limits (null or -1 = "Unlimited")
5. Display plan name and limits
```

---

### Project Commands

#### `langctl projects list`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. POST to list-projects Edge Function
3. Parse response with projects array
4. For each project, display:
   - Name (bold)
   - Slug
   - Description
   - Languages (comma-separated)
   - Default language
   - Modules (if any)
5. Show export command example
```

#### `langctl projects create <name>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. Parse options:
   - languages: split by comma, default 'en'
   - defaultLanguage: default to first language
   - description: optional
3. POST to manage-projects with action: 'create'
4. Send: name, description, languages array, defaultLanguage
5. Display success with project slug
```

#### `langctl projects get <slug>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. POST to list-projects
3. Find project with matching slug
4. Display detailed info:
   - Name, slug, ID
   - Description
   - All languages
   - Default language
   - Modules list
```

**Note**: We use list-projects and filter client-side because manage-projects 'get' action requires project ID, but users only know slugs.

#### `langctl projects update <slug>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. POST to list-projects to get project ID from slug
3. Build updateData object with:
   - name (if provided)
   - description (if provided)
   - languages array (if provided, split by comma)
   - defaultLanguage (if provided)
4. POST to manage-projects with action: 'update'
5. Send projectId + updateData
6. Display success
```

#### `langctl projects delete <slug>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug (via list-projects)
3. POST to manage-projects with action: 'delete'
4. Send projectId
5. Display success
```

**Note**: This is a soft delete. Project is marked deleted but not removed from database.

#### `langctl projects add-language <slug> <language>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. POST to manage-projects with action: 'add-language'
4. Send: projectId, language
5. Edge Function validates:
   - Project exists
   - Language not already in project
6. Display success message from server
```

#### `langctl projects remove-language <slug> <language>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. POST to manage-projects with action: 'remove-language'
4. Send: projectId, language
5. Edge Function validates:
   - Project exists
   - Language exists in project
   - Language is not the default language
6. Display success message from server
```

#### `langctl projects stats <slug>`
**File**: `src/commands/projects.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. POST to manage-projects with action: 'stats'
4. Parse response with:
   - total_keys
   - published_keys
   - unpublished_keys
   - modules (count)
   - module_names (array)
5. Display formatted statistics
```

---

### Translation Key Commands

#### Helper Function: `getProjectBySlug()`
**File**: `src/commands/keys.ts`

```typescript
// Purpose: Convert project slug to project ID
// Process:
1. POST to list-projects
2. Find project where project.slug === slug
3. Return Project object or null
// Why: Edge Functions need project ID, users only know slugs
```

#### `langctl keys list <project>`
**File**: `src/commands/keys.ts`

```typescript
// Process:
1. Check authentication
2. Get project object from slug
3. POST to manage-translation-keys with action: 'list'
4. Send filters:
   - projectId
   - module (optional)
   - published (optional boolean)
   - search (optional string)
   - limit (default 100)
   - offset (default 0)
5. Parse response with keys array
6. For each key, display:
   - Key name (bold)
   - Description
   - Module
   - Published status (colored)
   - Languages available
```

#### `langctl keys get <project> <key>`
**File**: `src/commands/keys.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. POST to manage-translation-keys with action: 'list'
4. Send: projectId, search: keyName, limit: 1
5. Find exact match in results
6. Display detailed info:
   - Key name and ID
   - Description
   - Module
   - Published status
   - All translations (all languages)
```

**Note**: We use 'list' action with search instead of 'get' to match by key name (users don't know key IDs).

#### `langctl keys create <project> <key>`
**File**: `src/commands/keys.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. Parse options:
   - Build translations object from --value-* options
   - Example: --value-en → translations.en
   - Example: --value-es → translations.es
4. POST to manage-translation-keys with action: 'create'
5. Send:
   - projectId
   - key (key name)
   - translations (object)
   - description (optional)
   - module (optional)
   - tags (array, optional)
6. Display success
```

**Implementation Detail**: Options starting with 'value' are converted to language codes:
```typescript
Object.keys(options).forEach(opt => {
  if (opt.startsWith('value')) {
    const lang = opt.replace('value', '').toLowerCase();
    if (lang) translations[lang] = options[opt];
  }
});
```

#### `langctl keys delete <project> <key>`
**File**: `src/commands/keys.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. Find key ID (list with search, find exact match)
4. POST to manage-translation-keys with action: 'delete'
5. Send: projectId, keyId
6. Display success
```

**Note**: This is a soft delete.

#### `langctl keys translate <project> <key>`
**File**: `src/commands/keys.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. Find key ID
4. POST to manage-translation-keys with action: 'translate'
5. Send:
   - projectId
   - keyId
   - language (from --language option)
   - value (from --value option)
6. Display success with language and key name
```

#### `langctl keys publish <project> <keys...>`
**File**: `src/commands/keys.ts`

```typescript
// Process:
1. Check authentication
2. Get project ID from slug
3. List all keys (limit: 1000)
4. Filter keys by name (match against keys... argument)
5. Extract key IDs
6. POST to manage-translation-keys with action: 'publish'
7. Send:
   - projectId
   - keyIds (array)
   - published (boolean, true unless --unpublish)
8. Display success message from server
```

**Note**: Can publish/unpublish multiple keys at once.

---

### Team Commands

#### `langctl team list`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. POST to manage-team-members with action: 'list'
3. Parse response with members array
4. For each member, display:
   - Email (or user_id if no email)
   - Role
   - Join date
```

**Note**: Edge Function uses RPC function `get_organization_members_with_users` to join with auth.users.

#### `langctl team get <email>`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. POST to manage-team-members with action: 'get'
3. Send: email
4. Display:
   - Email
   - Role
   - User ID
   - Join date
```

#### `langctl team invite <email>`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. POST to manage-team-members with action: 'invite'
3. Send:
   - email
   - role (default: 'member', from --role option)
4. Edge Function:
   - Calls RPC function invite_user_to_organization
   - Creates invitation record
   - Sends email (via database trigger)
5. Display success message
```

**Roles**: viewer, member, admin (not owner - that's assigned at org creation).

#### `langctl team remove <email>`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. POST to manage-team-members with action: 'remove'
3. Send: email
4. Edge Function validates:
   - User exists
   - User is member of organization
   - User is not the owner
   - User is not self (cannot remove yourself)
5. Deletes organization_members record
6. Display success
```

#### `langctl team update-role <email> <role>`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. Validate role (viewer, member, admin)
3. POST to manage-team-members with action: 'update-role'
4. Send: email, role
5. Edge Function validates:
   - User exists and is member
   - Cannot change to/from owner role
6. Updates organization_members.role
7. Display success
```

#### `langctl team invitations`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. POST to manage-team-members with action: 'list-invitations'
3. Send: pending (boolean from --pending option)
4. Parse response with invitations array
5. For each invitation, display:
   - Email
   - Role
   - Status (pending, accepted, cancelled)
   - Invited date
   - Expires date
```

#### `langctl team revoke-invitation <email>`
**File**: `src/commands/team.ts`

```typescript
// Process:
1. Check authentication
2. POST to manage-team-members with action: 'revoke-invitation'
3. Send: email
4. Edge Function:
   - Finds pending invitation for email
   - Updates status to 'cancelled'
5. Display success
```

---

### Export/Import Commands

#### `langctl export <project>`
**File**: `src/commands/export.ts`

```typescript
// Process:
1. Check authentication
2. Get project object from slug
3. Validate format (flat-json, nested-json, i18n-json, android-xml, ios-strings, flutter-arb)
4. POST to export-translations
5. Send:
   - projectSlug
   - language (optional)
   - format
   - module (optional)
   - includeUnpublished (boolean)
6. Parse response with translations
7. If language specified:
   - Write to file (output path or auto-generated)
8. If no language (export all):
   - Loop through all project languages
   - Export each language
   - Write to separate files
9. Display success with file paths
```

**Auto-generated paths**:
- JSON formats: `./translations/<slug>.<language>.json`
- iOS: `./translations/<slug>.<language>.strings`
- Android: `./translations/<slug>.<language>.xml`
- Flutter: `./translations/<slug>.<language>.arb`

**Format Conversion**: Done server-side in Edge Function:
- Converts `{{param}}` to platform-specific format
- Android: `%1$s` (positional)
- iOS: `%@` (positional)
- Flutter: `{param}` (named)

#### `langctl import <project> <file>`
**File**: `src/commands/import.ts`

```typescript
// Process:
1. Check authentication
2. Get project object from slug
3. Validate language option is provided
4. Read file:
   - Check file exists
   - Parse JSON
5. Flatten JSON if nested:
   - Converts { "home": { "title": "..." } } to { "home.title": "..." }
6. POST to push-translations
7. Send:
   - projectSlug
   - language
   - translations (flattened object)
   - overwrite (boolean from --overwrite)
   - publish (boolean from --publish)
8. Parse response:
   - created: number of new keys
   - updated: number of updated keys
   - skipped: number of skipped keys
9. Display summary
```

**Flattening Logic**:
```typescript
function flattenObject(obj: any, prefix = ''): Record<string, string> {
  let result: Record<string, string> = {};
  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = String(value);
    }
  }
  return result;
}
```

---

## Configuration Management

### File: `src/config.ts`

```typescript
class Config {
  private configPath: string;
  private configDir: string;
  private data: Record<string, any>;

  constructor() {
    // Config stored at: ~/.langctl/config.json
    this.configDir = path.join(os.homedir(), '.langctl');
    this.configPath = path.join(this.configDir, 'config.json');
    this.load();
  }

  private load() {
    // Create directory if doesn't exist
    // Read config.json or initialize empty object
  }

  private save() {
    // Write config.json with pretty formatting
  }

  get(key: string): any {
    return this.data[key];
  }

  set(key: string, value: any) {
    this.data[key] = value;
    this.save();
  }

  delete(key: string) {
    delete this.data[key];
    this.save();
  }

  getAll(): Record<string, any> {
    return { ...this.data };
  }
}

export const config = new Config();
```

### Configuration Keys

- `apiKey`: User's API key (plain text)
- `organizationId`: UUID of organization
- `organizationName`: Display name
- `defaultLanguage`: User preference for language (not currently used)
- `defaultProject`: User's default project slug (not currently used)

---

## Error Handling

### Common Error Patterns

#### Network Errors
```typescript
try {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }
} catch (error: any) {
  spinner.fail(chalk.red('Operation failed'));
  console.error(chalk.red(`Error: ${error.message}\n`));
}
```

#### Authentication Errors
```typescript
if (!isAuthenticated()) {
  console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
  return;
}
```

#### Validation Errors
```typescript
if (!validRoles.includes(role)) {
  console.log(chalk.red(`✗ Invalid role. Must be one of: ${validRoles.join(', ')}\n`));
  return;
}
```

### Error Display

- Use `chalk.red()` for errors
- Use `chalk.yellow()` for warnings
- Use `chalk.green()` for success
- Use `spinner.fail()` for operation failures
- Always include newline at end for readability

---

## Testing & Deployment

### Building

```bash
cd langctl-cli
npm run build
```

This compiles TypeScript to JavaScript in `dist/` directory.

### Testing Locally

```bash
# Test specific command
node dist/index.js org info

# Or use npm link for global testing
npm link
langctl org info
```

### Deploying Edge Functions

```bash
# Deploy all functions
supabase functions deploy --no-verify-jwt

# Deploy specific function
supabase functions deploy manage-projects --no-verify-jwt
```

**IMPORTANT**: Always use `--no-verify-jwt` flag. Edge Functions authenticate using custom X-API-Key header, not Supabase JWT.

### Publishing to npm

```bash
npm version patch  # or minor, or major
npm publish
```

---

## Adding New Commands

### Step 1: Create Edge Function

1. Create function directory:
```bash
mkdir -p supabase/functions/my-function
```

2. Create `index.ts`:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyApiKey(supabase: any, apiKey: string) {
  try {
    const keyHash = await hashApiKey(apiKey.trim().toLowerCase())
    const { data, error } = await supabase
      .from('api_keys')
      .select('organization_id, created_by, scopes, revoked')
      .eq('key_hash', keyHash)
      .eq('revoked', false)
      .single()

    if (error || !data) {
      return { valid: false, error: 'Invalid or revoked API key' }
    }

    return {
      valid: true,
      organizationId: data.organization_id,
      userId: data.created_by,
      scopes: data.scopes
    }
  } catch (error) {
    return { valid: false, error: 'Authentication failed' }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = req.headers.get('X-API-Key')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'X-API-Key header is required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const auth = await verifyApiKey(supabase, apiKey)
    if (!auth.valid) {
      return new Response(
        JSON.stringify({ success: false, error: auth.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, ...params } = await req.json()

    let result

    switch (action) {
      case 'my-action':
        // Your logic here
        result = { success: true, data: {} }
        break
      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

3. Create `deno.json`:
```json
{
  "imports": {}
}
```

4. Add to `supabase/config.toml`:
```toml
[functions.my-function]
enabled = true
verify_jwt = false
import_map = "./functions/my-function/deno.json"
entrypoint = "./functions/my-function/index.ts"
```

5. Deploy:
```bash
supabase functions deploy my-function --no-verify-jwt
```

### Step 2: Create CLI Command

1. Create command file:
```typescript
// src/commands/mycommand.ts
import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated, getApiKey } from '../auth.js';

const MY_FUNCTION_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/my-function';

export async function myCommand(arg: string, options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Processing...').start();

  try {
    const response = await fetch(MY_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'my-action',
        arg,
        ...options
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green('Success!'));
    console.log(data.result);

  } catch (error: any) {
    spinner.fail(chalk.red('Failed'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
```

2. Register in `src/index.ts`:
```typescript
import { myCommand } from './commands/mycommand.js';

program
  .command('mycommand <arg>')
  .description('Description of my command')
  .option('-f, --flag <value>', 'Flag description')
  .action(async (arg: string, options: any) => {
    try {
      await myCommand(arg, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });
```

3. Build and test:
```bash
npm run build
node dist/index.js mycommand test-arg --flag value
```

---

## Security Considerations

### What Users Can Access

- ✅ Their API key (plain text, stored locally)
- ✅ Their organization data (via API key auth)
- ✅ Projects within their organization

### What Users CANNOT Access

- ❌ Supabase credentials
- ❌ Other organizations' data
- ❌ Database connection strings
- ❌ Service role keys
- ❌ Edge Function URLs (hardcoded, but not secret)

### API Key Security

1. **Format Validation**: Strict format enforcement prevents injection
2. **SHA-256 Hashing**: Keys hashed before storage
3. **Server-Side Validation**: All validation happens on server
4. **Organization Scoping**: Keys tied to specific organization
5. **Revocable**: Keys can be revoked from dashboard

### Edge Function Security

1. **No JWT Verification**: Uses custom X-API-Key header
2. **Service Role Key**: Edge Functions use service role for database access
3. **Input Validation**: All inputs validated before database queries
4. **Row Level Security**: Database RLS policies provide additional security layer
5. **CORS Enabled**: Allows CLI to call functions

---

## Common Debugging Patterns

### Check Authentication
```bash
langctl config  # View stored credentials
```

### Test Edge Function Directly
```bash
curl -X POST https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/my-function \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lc_..." \
  -d '{"action":"test"}'
```

### Check Edge Function Logs
```bash
supabase functions logs my-function
```

### Verify API Key
```bash
curl -X POST https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/verify-api-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"lc_..."}'
```

### Test Command Locally
```bash
cd langctl-cli
npm run build
node dist/index.js <command> <args>
```

---

## Performance Considerations

### Avoiding Multiple API Calls

**Bad**:
```typescript
// Get project ID
const projects = await listProjects();
const project = projects.find(p => p.slug === slug);

// Then use project ID for each key
for (const key of keys) {
  await getKey(project.id, key);
}
```

**Good**:
```typescript
// Get project ID once
const projects = await listProjects();
const project = projects.find(p => p.slug === slug);

// Batch operation
await publishKeys(project.id, keys);
```

### Caching Project Data

The `getProjectBySlug()` helper is called frequently. Consider:
- Caching project list for session
- Storing last-used project slug
- Implementing project shortcuts

**Current**: Each command calls list-projects
**Future**: Cache in config with TTL

---

## Future Improvements

See `NEXT_PHASE.md` for Phase 3 features.

---

## Summary

### Request Flow

1. User runs command: `langctl keys list my-app`
2. Commander parses: command='keys list', args=['my-app'], options={}
3. Calls: `listKeysCommand('my-app', {})`
4. Checks: `isAuthenticated()` → reads ~/.langctl/config.json
5. Gets: `getApiKey()` → reads from config
6. Fetches: `list-projects` → converts slug to project ID
7. Posts: `manage-translation-keys` with action='list'
8. Edge Function: Validates API key, queries database
9. Response: JSON with keys array
10. Format: Chalk colors + console.log
11. Exit: Process completes

### Key Files to Know

- `src/index.ts` - Command registration
- `src/auth.ts` - Authentication logic
- `src/config.ts` - Configuration management
- `src/commands/*.ts` - Command implementations
- `supabase/functions/*/index.ts` - Edge Functions
- `supabase/config.toml` - Edge Function configuration

### Architecture Principles

1. **CLI Never Touches Database**: All through Edge Functions
2. **User-Friendly Arguments**: Use slugs/names, not UUIDs
3. **Consistent Error Handling**: Always use try/catch with spinners
4. **Colored Output**: Success=green, Error=red, Info=blue/white
5. **Helpful Messages**: Guide users to next steps

---

**Last Updated**: Phase 1 & 2 Complete (January 2026)

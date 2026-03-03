<div align="center">

# Langctl

**CLI-first translation management for developers**

[![npm version](https://img.shields.io/npm/v/langctl.svg)](https://www.npmjs.com/package/langctl)
[![license](https://img.shields.io/npm/l/langctl.svg)](https://github.com/siddharthsaxena0/langctl/blob/main/LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/langctl.svg)](https://www.npmjs.com/package/langctl)

**[Website](https://langctl.com)** · **[Documentation](https://langctl.com/docs)** · **[Get Started](https://app.langctl.com/signup)**

<!-- Add a demo GIF here: -->
<!-- ![langctl demo](assets/demo.gif) -->

</div>

---

Langctl is a powerful command-line tool that lets you manage translations directly from your terminal. Create projects, manage translation keys, invite team members, export in multiple formats, and integrate seamlessly into your CI/CD pipeline.

## Features

- 🚀 **Complete Project Management** - Create, update, and manage translation projects
- 🔑 **Translation Key CRUD** - Full control over translation keys and values
- 👥 **Team Management** - Invite members, manage roles, and handle invitations
- 📊 **Organization Insights** - View stats, plan limits, and usage metrics
- 📦 **Multi-Format Export** - Support for JSON, iOS, Android, Flutter, and i18n
- 🔄 **Import Translations** - Bulk import from JSON files
- 🤖 **CI/CD Ready** - Perfect for automated workflows
- 🌍 **Multi-Language Support** - Manage unlimited languages per project

## Installation

```bash
npm install -g langctl
```

Or use with npx (no installation required):

```bash
npx langctl --help
```

## Quick Start

> **📌 First time here?** Check out our [Getting Started Guide](https://langctl.com/docs/getting-started/introduction) on the website for a complete walkthrough!

### 1. Get Your API Key

1. Visit **[app.langctl.com](https://app.langctl.com/signup)** and create a free account
2. Go to **Settings → API Keys**
3. Click **"Generate New Key"**
4. Copy the key (it's only shown once!)

> **💡 Tip:** Learn more about API keys and authentication at [langctl.com/docs/cli/authentication](https://langctl.com/docs/cli/authentication)

### 2. Authenticate

```bash
# Interactive setup
langctl init

# Or authenticate directly
langctl auth lc_your_api_key_here
```

### 3. Explore Your Organization

```bash
# View organization info
langctl org info

# Check statistics
langctl org stats

# List your projects
langctl projects list
```

### 4. Start Working with Translations

```bash
# List translation keys
langctl keys list my-project

# Export translations
langctl export my-project --language en --format json

# Create a new key
langctl keys create my-project home.welcome \
  --value-en "Welcome!" \
  --value-es "¡Bienvenido!"
```

---

## Commands Overview

### Authentication
- `langctl init` - Interactive setup wizard
- `langctl auth <api-key>` - Authenticate with API key
- `langctl logout` - Clear credentials
- `langctl config` - View current configuration

### Organization
- `langctl org info` - View organization details
- `langctl org stats` - View organization statistics
- `langctl org plan` - View subscription plan and limits

### Projects
- `langctl projects list` - List all projects
- `langctl projects create <name>` - Create new project
- `langctl projects get <slug>` - Get project details
- `langctl projects update <slug>` - Update project
- `langctl projects delete <slug>` - Delete project
- `langctl projects add-language <slug> <language>` - Add language
- `langctl projects remove-language <slug> <language>` - Remove language
- `langctl projects stats <slug>` - View project statistics

### Translation Keys
- `langctl keys list <project>` - List translation keys
- `langctl keys get <project> <key>` - Get key details
- `langctl keys create <project> <key>` - Create new key
- `langctl keys delete <project> <key>` - Delete key
- `langctl keys translate <project> <key>` - Update translation
- `langctl keys publish <project> <keys...>` - Publish/unpublish keys

### Team
- `langctl team list` - List team members
- `langctl team get <email>` - Get member details
- `langctl team invite <email>` - Invite team member
- `langctl team remove <email>` - Remove team member
- `langctl team update-role <email> <role>` - Update member role
- `langctl team invitations` - List invitations
- `langctl team revoke-invitation <email>` - Revoke invitation

### Import/Export
- `langctl export <project>` - Export translations
- `langctl import <project> <file>` - Import translations

---

## Detailed Command Reference

### Authentication Commands

#### `langctl init`

Interactive setup wizard that guides you through authentication and configuration.

```bash
langctl init
```

#### `langctl auth <api-key>`

Authenticate with an API key from your dashboard.

```bash
langctl auth lc_abc123...
```

#### `langctl logout`

Clear stored authentication credentials.

```bash
langctl logout
```

#### `langctl config`

Display current configuration (API key, organization, etc.).

```bash
langctl config
```

---

### Organization Commands

#### `langctl org info`

View your organization details.

```bash
langctl org info
```

**Output:**
- Organization name and ID
- Slug
- Subscription plan
- Creation date

#### `langctl org stats`

View comprehensive organization statistics.

```bash
langctl org stats
```

**Output:**
- Total team members
- Number of projects
- Translation key counts (total, published, unpublished)
- Languages used across projects
- API keys and webhooks

#### `langctl org plan`

View subscription plan details and resource limits.

```bash
langctl org plan
```

**Output:**
- Current plan (Free, Pro, Team, Enterprise)
- Max members allowed
- Max projects allowed
- Max keys per project
- Max API keys allowed

---

### Project Management Commands

#### `langctl projects list`

List all projects you have access to.

```bash
langctl projects list
```

**Output:**
- Project name and slug
- Description
- Supported languages
- Default language
- Available modules

#### `langctl projects create <name>`

Create a new translation project.

```bash
langctl projects create "Mobile App" \
  --description "iOS and Android translations" \
  --languages en,es,fr,de \
  --default-language en
```

**Options:**
- `-d, --description <text>` - Project description
- `-l, --languages <langs>` - Comma-separated language codes (default: `en`)
- `--default-language <code>` - Default language (default: first language)

**Examples:**

```bash
# Simple project with English only
langctl projects create "My App"

# Multi-language project
langctl projects create "Global App" \
  -l en,es,fr,de,ja \
  --default-language en

# With description
langctl projects create "Mobile App" \
  -d "Translation keys for mobile application" \
  -l en,es
```

#### `langctl projects get <slug>`

Get detailed information about a specific project.

```bash
langctl projects get my-app
```

**Output:**
- Project name, ID, and slug
- Description
- All supported languages
- Default language
- List of modules

#### `langctl projects update <slug>`

Update project details.

```bash
langctl projects update my-app \
  --name "New Name" \
  --description "Updated description" \
  --languages en,es,fr,de,ja \
  --default-language en
```

**Options:**
- `-n, --name <name>` - Update project name
- `-d, --description <text>` - Update description
- `-l, --languages <langs>` - Update supported languages
- `--default-language <code>` - Update default language

**Examples:**

```bash
# Change project name
langctl projects update my-app --name "Better Name"

# Add more languages
langctl projects update my-app -l en,es,fr,de,ja,zh

# Update description only
langctl projects update my-app -d "New project description"
```

#### `langctl projects delete <slug>`

Delete a project (soft delete - can be recovered).

```bash
langctl projects delete my-app
```

**Warning:** This will mark the project as deleted. Contact support to recover deleted projects.

#### `langctl projects add-language <slug> <language>`

Add a new language to an existing project.

```bash
langctl projects add-language my-app de
```

**Examples:**

```bash
# Add German
langctl projects add-language my-app de

# Add Japanese
langctl projects add-language my-app ja

# Add Chinese
langctl projects add-language my-app zh
```

#### `langctl projects remove-language <slug> <language>`

Remove a language from a project.

```bash
langctl projects remove-language my-app de
```

**Note:** Cannot remove the default language. Change default language first if needed.

#### `langctl projects stats <slug>`

View project statistics.

```bash
langctl projects stats my-app
```

**Output:**
- Total translation keys
- Published vs unpublished counts
- Number of modules
- List of module names

---

### Translation Key Commands

#### `langctl keys list <project>`

List translation keys for a project.

```bash
langctl keys list my-app
```

**Options:**
- `-m, --module <name>` - Filter by module
- `-p, --published` - Show only published keys
- `-s, --search <term>` - Search in key names
- `--limit <number>` - Limit results (default: 100)
- `--offset <number>` - Offset for pagination (default: 0)

**Examples:**

```bash
# List all keys
langctl keys list my-app

# Filter by module
langctl keys list my-app --module auth

# Show only published keys
langctl keys list my-app --published

# Search for specific keys
langctl keys list my-app --search "welcome"

# Pagination
langctl keys list my-app --limit 50 --offset 0
langctl keys list my-app --limit 50 --offset 50
```

#### `langctl keys get <project> <key>`

Get detailed information about a specific translation key.

```bash
langctl keys get my-app home.welcome
```

**Output:**
- Key name and ID
- Description
- Module
- Published status
- All translations for all languages

#### `langctl keys create <project> <key>`

Create a new translation key with values for multiple languages.

```bash
langctl keys create my-app home.welcome \
  --description "Welcome message on homepage" \
  --module home \
  --value-en "Welcome to our app!" \
  --value-es "¡Bienvenido a nuestra aplicación!" \
  --value-fr "Bienvenue dans notre application!" \
  --value-de "Willkommen in unserer App!"
```

**Options:**
- `-d, --description <text>` - Key description
- `-m, --module <name>` - Module/namespace for organization
- `--value-en <value>` - English translation
- `--value-es <value>` - Spanish translation
- `--value-fr <value>` - French translation
- `--value-de <value>` - German translation
- `--tags <tags>` - Comma-separated tags

**Supported language options:**
You can use `--value-{language}` for any language code in your project.

**Examples:**

```bash
# Simple key with one language
langctl keys create my-app button.submit --value-en "Submit"

# Multi-language key
langctl keys create my-app home.title \
  --module home \
  --value-en "Home" \
  --value-es "Inicio" \
  --value-fr "Accueil"

# With description and tags
langctl keys create my-app error.network \
  --description "Network connection error" \
  --module errors \
  --value-en "Network error occurred" \
  --tags error,network
```

#### `langctl keys delete <project> <key>`

Delete a translation key.

```bash
langctl keys delete my-app home.welcome
```

#### `langctl keys translate <project> <key>`

Update the translation value for a specific language.

```bash
langctl keys translate my-app home.welcome \
  --language es \
  --value "¡Bienvenido!"
```

**Options:**
- `-l, --language <code>` - Language code (required)
- `-v, --value <text>` - Translation value (required)

**Examples:**

```bash
# Update Spanish translation
langctl keys translate my-app home.title -l es -v "Inicio"

# Update French translation
langctl keys translate my-app button.submit -l fr -v "Soumettre"

# Add translation for new language
langctl keys translate my-app home.welcome -l de -v "Willkommen"
```

#### `langctl keys publish <project> <keys...>`

Publish or unpublish translation keys.

```bash
# Publish keys
langctl keys publish my-app home.welcome home.title button.submit

# Unpublish keys
langctl keys publish my-app home.welcome --unpublish
```

**Options:**
- `--unpublish` - Unpublish instead of publish

**Examples:**

```bash
# Publish single key
langctl keys publish my-app home.welcome

# Publish multiple keys
langctl keys publish my-app home.welcome home.title home.subtitle

# Unpublish keys
langctl keys publish my-app test.key --unpublish
```

---

### Team Management Commands

#### `langctl team list`

List all team members in your organization.

```bash
langctl team list
```

**Output:**
- Member email
- Role (viewer, member, admin, owner)
- Join date

#### `langctl team get <email>`

Get details about a specific team member.

```bash
langctl team get user@example.com
```

#### `langctl team invite <email>`

Invite a new team member.

```bash
langctl team invite user@example.com --role member
```

**Options:**
- `-r, --role <role>` - Member role (default: `member`)
  - `viewer` - Read-only access
  - `member` - Can manage translations
  - `admin` - Full project and team management

**Examples:**

```bash
# Invite as member (default)
langctl team invite user@example.com

# Invite as admin
langctl team invite admin@example.com --role admin

# Invite as viewer
langctl team invite viewer@example.com --role viewer
```

#### `langctl team remove <email>`

Remove a team member from your organization.

```bash
langctl team remove user@example.com
```

**Note:** Cannot remove the organization owner. Cannot remove yourself (use appropriate UI for that).

#### `langctl team update-role <email> <role>`

Update a team member's role.

```bash
langctl team update-role user@example.com admin
```

**Valid roles:** `viewer`, `member`, `admin`

**Examples:**

```bash
# Promote to admin
langctl team update-role user@example.com admin

# Demote to viewer
langctl team update-role user@example.com viewer
```

#### `langctl team invitations`

List all invitations (pending, accepted, or cancelled).

```bash
# List all invitations
langctl team invitations

# List only pending invitations
langctl team invitations --pending
```

**Options:**
- `-p, --pending` - Show only pending invitations

#### `langctl team revoke-invitation <email>`

Revoke a pending invitation.

```bash
langctl team revoke-invitation user@example.com
```

---

### Export/Import Commands

#### `langctl export <project>`

Export translations in various formats.

```bash
langctl export my-app --language en --format flat-json
```

**Options:**
- `-l, --language <code>` - Language to export (default: exports all languages)
- `-f, --format <type>` - Export format (default: `flat-json`)
- `-o, --output <path>` - Output file path (optional)
- `-m, --module <name>` - Export only specific module
- `--include-unpublished` - Include unpublished keys (default: published only)

**Supported formats:**
- `flat-json` - Flat key-value JSON (default)
- `nested-json` - Nested JSON structure
- `i18n-json` - i18next compatible format
- `android-xml` - Android strings.xml format
- `ios-strings` - iOS Localizable.strings format
- `flutter-arb` - Flutter ARB format

**Examples:**

```bash
# Export single language as JSON
langctl export my-app -l en -f flat-json

# Export all languages
langctl export my-app

# Export for iOS
langctl export my-app -l en -f ios-strings -o ./ios/en.lproj/Localizable.strings

# Export for Android
langctl export my-app -l es -f android-xml -o ./android/res/values-es/strings.xml

# Export for Flutter
langctl export my-app -l fr -f flutter-arb -o ./lib/l10n/app_fr.arb

# Export specific module
langctl export my-app -l en --module auth

# Include unpublished translations
langctl export my-app -l en --include-unpublished
```

#### `langctl import <project> <file>`

Import translations from a JSON file.

```bash
langctl import my-app translations.json --language en
```

**Options:**
- `-l, --language <code>` - Target language (required)
- `--overwrite` - Overwrite existing translations
- `--publish` - Auto-publish imported keys

**Examples:**

```bash
# Import English translations
langctl import my-app en.json -l en

# Import and overwrite existing
langctl import my-app en.json -l en --overwrite

# Import and auto-publish
langctl import my-app en.json -l en --publish

# Import multiple languages
langctl import my-app en.json -l en --publish
langctl import my-app es.json -l es --publish
langctl import my-app fr.json -l fr --publish
```

**Supported JSON formats:**

```json
// Flat format (recommended)
{
  "home.welcome": "Welcome!",
  "home.subtitle": "Get started",
  "button.submit": "Submit"
}

// Nested format (auto-flattened)
{
  "home": {
    "welcome": "Welcome!",
    "subtitle": "Get started"
  },
  "button": {
    "submit": "Submit"
  }
}
```

---

## Export Format Examples

### Flat JSON (Default)

```json
{
  "home.welcome": "Welcome!",
  "home.subtitle": "Get started with {{appName}}",
  "button.submit": "Submit"
}
```

### Nested JSON

```json
{
  "home": {
    "welcome": "Welcome!",
    "subtitle": "Get started with {{appName}}"
  },
  "button": {
    "submit": "Submit"
  }
}
```

### i18next JSON

```json
{
  "home": {
    "welcome": "Welcome!",
    "subtitle": "Get started with {{appName}}"
  }
}
```

### iOS Strings

```
/* Welcome message */
"home.welcome" = "Welcome!";

/* Homepage subtitle with app name placeholder */
"home.subtitle" = "Get started with %@";
```

### Android XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <!-- Welcome message -->
  <string name="home.welcome">Welcome!</string>

  <!-- Homepage subtitle with app name placeholder -->
  <string name="home.subtitle">Get started with %1$s</string>
</resources>
```

### Flutter ARB

```json
{
  "@@locale": "en",
  "home.welcome": "Welcome!",
  "@home.welcome": {
    "description": "Welcome message"
  },
  "home.subtitle": "Get started with {appName}",
  "@home.subtitle": {
    "description": "Homepage subtitle",
    "placeholders": {
      "appName": {
        "type": "String"
      }
    }
  }
}
```

---

## Real-World Workflows

### Complete Project Setup

```bash
# 1. Authenticate
langctl auth lc_your_api_key_here

# 2. Create project
langctl projects create "Mobile App" \
  -l en,es,fr,de \
  --default-language en \
  -d "iOS and Android application"

# 3. Add translation keys
langctl keys create mobile-app home.welcome \
  --module home \
  --value-en "Welcome!" \
  --value-es "¡Bienvenido!" \
  --value-fr "Bienvenue!"

langctl keys create mobile-app button.submit \
  --module common \
  --value-en "Submit" \
  --value-es "Enviar" \
  --value-fr "Soumettre"

# 4. Publish keys
langctl keys publish mobile-app home.welcome button.submit

# 5. Export for platforms
langctl export mobile-app -l en -f ios-strings -o ./ios/en.lproj/
langctl export mobile-app -l en -f android-xml -o ./android/res/values/
```

### Bulk Import Workflow

```bash
# 1. Prepare JSON files (en.json, es.json, fr.json)
# 2. Import all languages
langctl import my-app en.json -l en --publish
langctl import my-app es.json -l es --publish
langctl import my-app fr.json -l fr --publish

# 3. Verify imports
langctl keys list my-app --published
langctl projects stats my-app
```

### Team Collaboration

```bash
# 1. Invite team members
langctl team invite developer@example.com --role member
langctl team invite manager@example.com --role admin

# 2. Check invitations
langctl team invitations --pending

# 3. Manage roles
langctl team update-role developer@example.com admin

# 4. View team
langctl team list
```

### Multi-Platform Export

```bash
# Export for all platforms
PROJECT="my-app"
LANG="en"

# Web (i18next)
langctl export $PROJECT -l $LANG -f i18n-json -o ./src/locales/$LANG.json

# iOS
langctl export $PROJECT -l $LANG -f ios-strings -o ./ios/$LANG.lproj/Localizable.strings

# Android
langctl export $PROJECT -l $LANG -f android-xml -o ./android/res/values/strings.xml

# Flutter
langctl export $PROJECT -l $LANG -f flutter-arb -o ./lib/l10n/app_$LANG.arb
```

---

## CI/CD Integration

### GitHub Actions

Automated translation sync workflow:

```yaml
name: Sync Translations

on:
  schedule:
    - cron: '0 0 * * *' # Daily at midnight
  workflow_dispatch: # Manual trigger

jobs:
  sync-translations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Langctl
        run: npm install -g langctl

      - name: Authenticate
        env:
          LANGCTL_API_KEY: ${{ secrets.LANGCTL_API_KEY }}
        run: langctl auth $LANGCTL_API_KEY

      - name: Export Translations
        run: |
          langctl export my-project -l en -f i18n-json -o ./locales/en.json
          langctl export my-project -l es -f i18n-json -o ./locales/es.json
          langctl export my-project -l fr -f i18n-json -o ./locales/fr.json

      - name: Commit Changes
        run: |
          git config user.name "Langctl Bot"
          git config user.email "bot@langctl.com"
          git add locales/
          git diff --staged --quiet || git commit -m "chore: update translations [skip ci]"
          git push
```

### GitLab CI

```yaml
sync-translations:
  image: node:18
  script:
    - npm install -g langctl
    - langctl auth $LANGCTL_API_KEY
    - langctl export my-project -l en -f json -o ./locales/en.json
    - langctl export my-project -l es -f json -o ./locales/es.json
    - git config user.name "Langctl Bot"
    - git config user.email "bot@langctl.com"
    - git add locales/
    - git diff --staged --quiet || git commit -m "chore: update translations"
    - git push origin $CI_COMMIT_BRANCH
  only:
    - schedules
```

### Docker

```dockerfile
FROM node:18-alpine

RUN npm install -g langctl

WORKDIR /app

COPY . .

# Set API key via environment variable
ENV LANGCTL_API_KEY=""

# Example: Export translations on build
RUN langctl auth $LANGCTL_API_KEY && \
    langctl export my-project -l en -f json -o ./public/locales/en.json
```

---

## Best Practices

### Project Organization

1. **Use modules** to organize keys by feature:
   ```bash
   langctl keys create app auth.login.title --module auth
   langctl keys create app home.hero.title --module home
   langctl keys create app settings.profile.name --module settings
   ```

2. **Follow naming conventions**:
   ```
   module.screen.element
   auth.login.title
   home.hero.subtitle
   ```

3. **Add descriptions** to keys:
   ```bash
   langctl keys create app button.submit \
     --description "Primary action button across the app" \
     --value-en "Submit"
   ```

### Translation Workflow

1. **Create keys unpublished** (draft mode)
2. **Add translations** for all languages
3. **Review and test** translations
4. **Publish** when ready:
   ```bash
   langctl keys publish my-app key1 key2 key3
   ```

5. **Export** published translations only:
   ```bash
   langctl export my-app -l en
   ```

### Team Management

1. **Use appropriate roles**:
   - `viewer` - Stakeholders, reviewers (read-only)
   - `member` - Translators, content writers
   - `admin` - Project managers, team leads

2. **Regular access reviews**:
   ```bash
   langctl team list
   langctl team invitations
   ```

### Security

1. **Never commit API keys** to version control
2. **Use environment variables**:
   ```bash
   export LANGCTL_API_KEY="lc_..."
   langctl auth $LANGCTL_API_KEY
   ```

3. **Rotate keys periodically** from [app.langctl.com](https://app.langctl.com)

4. **Use different keys** for different environments:
   - Development key for local work
   - CI/CD key for automated workflows
   - Production key for releases

---

## Troubleshooting

### Authentication Issues

**"Not authenticated" error:**
```bash
# Solution: Authenticate with your API key
langctl auth lc_your_api_key_here
```

**"Invalid API key" error:**
- Verify key format (starts with `lc_`, 67 characters total)
- Check key hasn't been revoked at [app.langctl.com](https://app.langctl.com)
- Generate a new key if needed

### Project Issues

**"Project not found" error:**
```bash
# Check project slug (not name)
langctl projects list

# Use the slug shown in the list
langctl keys list correct-slug-here
```

**Cannot remove language:**
- Cannot remove the default language
- Change default language first:
  ```bash
  langctl projects update my-app --default-language en
  langctl projects remove-language my-app fr
  ```

### Import/Export Issues

**Import fails with format error:**
- Ensure JSON is valid
- Use flat key-value format or nested objects
- Check language code is valid

**Export shows no keys:**
- Verify keys are published:
  ```bash
  langctl keys list my-app --published
  ```
- Or include unpublished:
  ```bash
  langctl export my-app -l en --include-unpublished
  ```

### Connection Issues

If experiencing connectivity problems:
1. Check your internet connection
2. Verify you're not behind a restrictive firewall
3. Try again in a few moments
4. Contact support if issue persists

---

## FAQ

**Q: What's the difference between slug and name?**
A: The slug is the URL-friendly identifier (e.g., `my-app`), while the name is the display name (e.g., "My App"). Use slugs in CLI commands.

**Q: Can I use the CLI without installing it?**
A: Yes! Use `npx langctl` instead of `langctl` for any command.

**Q: How do I get my project slug?**
A: Run `langctl projects list` to see all project slugs.

**Q: Can I export multiple languages at once?**
A: Yes, run `langctl export my-app` without `-l` flag to export all languages.

**Q: What happens to unpublished keys?**
A: They're excluded from exports by default. Use `--include-unpublished` to include them.

**Q: Can I undo a delete operation?**
A: Projects and keys use soft deletes. Contact support to recover deleted items.

**Q: How do I change my default language?**
A: Run: `langctl projects update my-app --default-language <new-language>`

**Q: Can I use the CLI in CI/CD?**
A: Yes! Store your API key as a secret and use it in your workflow. See [CI/CD Integration](#cicd-integration).

---

## Platform Support

- ✅ macOS (Apple Silicon & Intel)
- ✅ Linux (x64, ARM64)
- ✅ Windows (x64, ARM64)
- ✅ Node.js 16.0.0 or higher

---

## 🌟 Why Langctl?

Tired of expensive translation management tools? Langctl offers:
- ✅ **Free to start** - No credit card required
- ✅ **90% cheaper** than enterprise alternatives
- ✅ **Developer-first** - Built for your workflow
- ✅ **AI-powered** - Context-aware translations
- ✅ **Open source CLI** - Inspect, fork, contribute

**[See pricing and compare features →](https://langctl.com/pricing)**

---

## 📚 Resources & Support

- 🌐 **[Website](https://langctl.com)** - Features, pricing, and comparisons
- 📖 **[Full Documentation](https://langctl.com/docs)** - Guides, tutorials, and best practices
- 🎯 **[Quick Start Tutorial](https://langctl.com/docs/getting-started/quickstart)** - Step-by-step walkthrough
- 💡 **[Integration Guides](https://langctl.com/docs/integrations/overview)** - React, Angular, Vue, iOS, Android, Flutter
- 📊 **[Dashboard](https://app.langctl.com)** - Manage translations visually
- 💬 **[Get Support](https://langctl.com/contact)** - Email us at [hello@langctl.com](mailto:hello@langctl.com)
- 🐛 **[Report Issues](https://github.com/siddharthsaxena0/langctl/issues)** - Bug reports and feature requests

---

## Contributing

We welcome contributions! This is an open-source project and we'd love your help making it better.

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

Copyright © 2026 Litcode Private Limited. All rights reserved.

---

<div align="center">

**Built with ❤️ by the Langctl team**

*Making translation management simple, fast, and developer-friendly.*

**[Get Started Free →](https://app.langctl.com/signup)**

</div>

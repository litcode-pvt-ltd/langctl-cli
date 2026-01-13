# Langctl CLI - Next Phase (Phase 3)

**Future Enhancements & Feature Ideas**

This document outlines potential features for Phase 3 and beyond. These are not committed but represent natural evolution of the CLI tool.

---

## Phase 3: Advanced Features

### 1. API Key Management Commands

Allow users to manage their API keys directly from CLI.

**Commands**:
```bash
langctl apikeys list                    # List all API keys
langctl apikeys create <name>           # Generate new API key
langctl apikeys revoke <key-id>         # Revoke an API key
langctl apikeys get <key-id>            # Get key details
```

**Benefits**:
- No need to switch to dashboard for key management
- Easier automation and CI/CD setup
- Key rotation workflows

**Implementation**:
- Create `manage-api-keys` Edge Function
- Add `apikeys.ts` command file
- Support scopes/permissions during creation

---

### 2. Translation History & Version Control

View and manage translation history.

**Commands**:
```bash
langctl history <project> <key>         # View key history
langctl history <project> --language en # View language history
langctl diff <project> <key> <from> <to> # Compare versions
langctl rollback <project> <key> <version> # Rollback to version
```

**Benefits**:
- Track who changed what and when
- Rollback bad translations
- Audit trail for compliance

**Implementation**:
- Edge Function queries `translation_history` table
- Display diffs with colored output
- Confirmation prompt for rollback

---

### 3. Bulk Operations

Efficient batch operations on translations.

**Commands**:
```bash
# Bulk update from CSV
langctl bulk update <project> <csv-file>

# Bulk delete by pattern
langctl bulk delete <project> --pattern "test.*"

# Bulk publish by module
langctl bulk publish <project> --module auth

# Bulk copy from one language to another
langctl bulk copy <project> --from en --to es --empty-only
```

**Benefits**:
- Faster large-scale updates
- Migration support
- Cleanup operations

**Implementation**:
- CSV parser for bulk updates
- Pattern matching (glob/regex)
- Progress bars for large operations
- Dry-run mode (`--dry-run`)

---

### 4. Translation Search & Discovery

Advanced search across translations.

**Commands**:
```bash
# Search across all projects
langctl search "welcome" --all-projects

# Search with regex
langctl search --regex "error\\..*" --project my-app

# Find missing translations
langctl missing <project> --language es

# Find untranslated keys
langctl untranslated <project>

# Find duplicate values
langctl duplicates <project> --language en
```

**Benefits**:
- Quick discovery
- Quality assurance
- Find reusable translations

**Implementation**:
- Edge Function with full-text search
- Support for regex patterns
- Highlight matches in output

---

### 5. Webhooks Management

Manage webhook endpoints from CLI.

**Commands**:
```bash
langctl webhooks list                   # List webhooks
langctl webhooks create <url>           # Create webhook
langctl webhooks delete <id>            # Delete webhook
langctl webhooks test <id>              # Test webhook
langctl webhooks logs <id>              # View webhook logs
```

**Benefits**:
- Configure integrations via CLI
- Debug webhook issues
- Automation workflows

**Implementation**:
- `manage-webhooks` Edge Function
- Webhook event filtering
- Retry configuration

---

### 6. Module Management

Enhanced module operations.

**Commands**:
```bash
langctl modules list <project>          # List modules
langctl modules create <project> <name> # Create module
langctl modules rename <project> <old> <new> # Rename module
langctl modules delete <project> <name> # Delete module
langctl modules merge <project> <from> <into> # Merge modules
```

**Benefits**:
- Better organization
- Refactoring support
- Module-level operations

**Implementation**:
- Edge Function for module operations
- Bulk key updates for rename/merge
- Validation to prevent conflicts

---

### 7. Interactive Mode

REPL-style interactive CLI.

**Command**:
```bash
langctl interactive
# or
langctl -i
```

**Features**:
- Command auto-completion
- Context-aware suggestions
- Multi-line inputs
- Command history
- Session persistence

**Benefits**:
- Better UX for exploratory work
- Faster iteration
- Learning tool for new users

**Implementation**:
- Use `inquirer` or `prompts` library
- Maintain session state
- Implement readline interface

---

### 8. Translation Validation

Validate translations for quality and consistency.

**Commands**:
```bash
# Validate all translations
langctl validate <project>

# Check specific validations
langctl validate <project> --check placeholders
langctl validate <project> --check length
langctl validate <project> --check format

# Fix common issues
langctl validate <project> --fix
```

**Checks**:
- Placeholder consistency (`{{name}}` in all languages)
- Length limits (too long/short)
- Format consistency (capitalization, punctuation)
- HTML/XML tag matching
- URL validity
- Variable interpolation

**Benefits**:
- Quality assurance
- Catch errors early
- Automated QA

**Implementation**:
- Validation rules engine
- Configurable rules per project
- Auto-fix capabilities

---

### 9. Translation Memory & Suggestions

Leverage existing translations for new keys.

**Commands**:
```bash
# Find similar translations
langctl suggest <project> <key>

# Auto-translate from memory
langctl auto-translate <project> --language es --similarity 0.9

# Export translation memory
langctl tm export <project> --language en

# Import translation memory
langctl tm import <project> <file>
```

**Benefits**:
- Faster translations
- Consistency
- Reuse existing work

**Implementation**:
- Fuzzy matching algorithm
- Translation memory database
- Confidence scoring

---

### 10. Git Integration

Native Git workflow integration.

**Commands**:
```bash
# Initialize translation tracking
langctl git init

# Commit translations
langctl git commit -m "Update translations"

# Create pull request with translations
langctl git pr

# Sync with Git
langctl git pull
langctl git push

# Compare with Git branch
langctl git diff main
```

**Benefits**:
- Version control integration
- PR-based workflows
- Branch-specific translations

**Implementation**:
- Git hooks
- Branch detection
- Auto-commit on export
- PR creation via GitHub/GitLab API

---

### 11. Analytics & Insights

Usage statistics and insights.

**Commands**:
```bash
# View usage stats
langctl analytics usage <project>

# Most used keys
langctl analytics top-keys <project>

# Translation coverage
langctl analytics coverage <project>

# Activity timeline
langctl analytics activity --last 30d

# Export analytics
langctl analytics export --format csv
```

**Metrics**:
- Most/least used keys
- Translation completion rates
- Update frequency
- Contributor activity
- Export patterns

**Benefits**:
- Data-driven decisions
- Identify unused keys
- Track team activity

**Implementation**:
- Analytics Edge Function
- Database queries on usage data
- Chart rendering (ASCII art)

---

### 12. Configuration Profiles

Multiple configuration profiles for different environments.

**Commands**:
```bash
# Create profile
langctl profile create staging

# Switch profile
langctl profile use production

# List profiles
langctl profile list

# Delete profile
langctl profile delete dev
```

**Benefits**:
- Easy environment switching
- Different API keys per environment
- Team-specific configs

**Implementation**:
- Multiple config files: `~/.langctl/profiles/`
- Active profile in `~/.langctl/config.json`
- Profile-specific settings

---

### 13. Automated Translation (AI)

AI-powered translation suggestions.

**Commands**:
```bash
# Auto-translate missing keys
langctl translate <project> --from en --to es --ai

# Review AI suggestions
langctl translate review <project>

# Accept/reject suggestions
langctl translate accept <project> <key>
langctl translate reject <project> <key>

# Batch translate
langctl translate batch <project> --languages es,fr,de
```

**Benefits**:
- Faster translation workflow
- Reduce manual work
- Maintain consistency

**Implementation**:
- Integration with translation APIs (Google, DeepL, GPT)
- Confidence scoring
- Human review workflow
- Cost estimation

---

### 14. Custom Scripts & Plugins

Extensibility via custom scripts.

**Commands**:
```bash
# Run custom script
langctl script run my-script.js

# Install plugin
langctl plugin install langctl-formatter

# List plugins
langctl plugin list

# Create script template
langctl script init
```

**Benefits**:
- Extensibility
- Custom workflows
- Community contributions

**Implementation**:
- Plugin system with hooks
- Script execution sandbox
- npm package support
- Plugin marketplace

---

### 15. Offline Mode

Work without internet connection.

**Commands**:
```bash
# Enable offline mode
langctl offline enable

# Sync to local cache
langctl offline sync <project>

# Work offline
langctl offline keys list <project>

# Push when back online
langctl offline push
```

**Benefits**:
- Work anywhere
- Faster operations
- Resilience

**Implementation**:
- SQLite local cache
- Sync protocol
- Conflict resolution

---

## Priority Ranking

### High Priority (Implement First)
1. **Translation Validation** - Quality is critical
2. **Bulk Operations** - High user demand
3. **Translation Search** - Improves discoverability
4. **Module Management** - Better organization

### Medium Priority
5. **Translation History** - Version control
6. **API Key Management** - Self-service
7. **Configuration Profiles** - Environment management
8. **Interactive Mode** - Better UX

### Low Priority (Nice to Have)
9. **Webhooks Management** - Advanced users
10. **Analytics & Insights** - Power users
11. **Git Integration** - Specific workflows
12. **Translation Memory** - Efficiency gains

### Future Exploration
13. **Automated Translation (AI)** - Cost/benefit analysis needed
14. **Custom Scripts & Plugins** - After core stabilization
15. **Offline Mode** - Complex, evaluate demand

---

## Technical Considerations

### Edge Functions Needed

New Edge Functions for Phase 3:
- `manage-api-keys`
- `manage-webhooks`
- `manage-modules`
- `translation-history`
- `search-translations`
- `validate-translations`
- `analytics`
- `translation-memory`

### Database Changes

Potential new tables:
- `validation_rules` - Custom validation rules
- `translation_memory` - TM cache
- `analytics_events` - Usage tracking
- `plugins` - Installed plugins
- `offline_sync` - Sync metadata

### CLI Dependencies

New packages to consider:
- `inquirer` - Interactive prompts
- `csv-parse` - CSV handling
- `better-sqlite3` - Offline cache
- `fuzzy-search` - Fuzzy matching
- `simple-git` - Git integration
- `cli-chart` - ASCII charts

---

## User Feedback Integration

Before implementing Phase 3, gather user feedback on:

1. **Most Requested Features**: Survey users
2. **Pain Points**: Identify bottlenecks
3. **Usage Patterns**: Analytics from Phase 1 & 2
4. **Edge Cases**: Unique workflows

---

## Implementation Strategy

### Incremental Rollout

1. **Alpha Testing**: Internal team only
2. **Beta Release**: Select customers
3. **Stable Release**: All users
4. **Feature Flags**: Toggle new features

### Backward Compatibility

- Maintain existing command signatures
- Deprecate features gracefully
- Provide migration paths
- Version API responses

### Documentation

- Update README for each feature
- Add examples to WORKING_INSTRUCTIONS
- Create video tutorials
- Blog posts for major features

---

## Success Metrics

Track these metrics to evaluate Phase 3:

- **Adoption Rate**: % of users using new features
- **Time Saved**: Efficiency improvements
- **Error Reduction**: Validation impact
- **User Satisfaction**: NPS score
- **Feature Usage**: Most/least used features

---

## Questions to Answer

Before starting Phase 3:

1. Which features provide most value?
2. What's the development effort vs. impact?
3. Are there any breaking changes needed?
4. What's the maintenance burden?
5. How does this affect the web dashboard?

---

## Conclusion

Phase 3 should focus on:
- **Quality**: Validation and consistency
- **Efficiency**: Bulk operations and search
- **Organization**: Module management
- **Intelligence**: AI-assisted workflows

Prioritize features that:
- Solve real user problems
- Have clear ROI
- Align with CLI-first philosophy
- Don't duplicate dashboard functionality unnecessarily

---

**Status**: Planning Phase
**Target**: Q2 2026 (tentative)
**Dependencies**: Phase 1 & 2 stable, user feedback collected

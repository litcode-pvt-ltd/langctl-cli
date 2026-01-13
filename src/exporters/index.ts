export interface TranslationKey {
  key: string;
  translations: Record<string, string>;
  description?: string;
  module?: string;
}

export type ExportFormat = 'json' | 'json-nested' | 'ios' | 'android' | 'flutter';

export interface ExportResult {
  content: string;
  filename: string;
}

/**
 * Helper: Set nested value in object based on dot-notation key
 */
function setNestedValue(obj: Record<string, any>, path: string, value: string): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Helper: Convert i18n format {{param}} to Android format %1$s, %2$s, etc.
 */
function convertToAndroidFormat(text: string): string {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return text;

  let result = text;
  matches.forEach((match, index) => {
    const paramNum = index + 1;
    result = result.replace(match, `%${paramNum}$s`);
  });

  return result;
}

/**
 * Helper: Convert i18n format {{param}} to iOS format %1$@, %2$@, etc.
 */
function convertToIosFormat(text: string): string {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return text;

  let result = text;
  matches.forEach((match, index) => {
    const paramNum = index + 1;
    result = result.replace(match, `%${paramNum}$@`);
  });

  return result;
}

/**
 * Helper: Convert i18n format {{param}} to Flutter format {param}
 */
function convertToFlutterFormat(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, '{$1}');
}

/**
 * Helper: Extract placeholder names from Flutter format {param}
 */
function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map(match => match.slice(1, -1));
}

/**
 * Helper: Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Helper: Escape .strings special characters
 */
function escapeStrings(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Export as flat JSON (simple key-value pairs)
 */
export function exportFlatJson(keys: TranslationKey[], languageCode: string): ExportResult {
  const translations: Record<string, string> = {};

  keys.forEach(key => {
    const translation = key.translations[languageCode];
    if (translation) {
      translations[key.key] = translation;
    }
  });

  return {
    content: JSON.stringify(translations, null, 2),
    filename: `${languageCode}.json`
  };
}

/**
 * Export as nested JSON (organized by key structure)
 */
export function exportNestedJson(keys: TranslationKey[], languageCode: string): ExportResult {
  const translations: Record<string, any> = {};

  keys.forEach(key => {
    const translation = key.translations[languageCode];
    if (translation) {
      setNestedValue(translations, key.key, translation);
    }
  });

  return {
    content: JSON.stringify(translations, null, 2),
    filename: `${languageCode}.json`
  };
}

/**
 * Export as iOS .strings format
 */
export function exportIosStrings(keys: TranslationKey[], languageCode: string): ExportResult {
  let content = '';

  keys.forEach(key => {
    const translation = key.translations[languageCode];
    if (translation) {
      const iosTranslation = convertToIosFormat(translation);
      const escapedTranslation = escapeStrings(iosTranslation);

      if (key.description) {
        content += `/* ${key.description} */\n`;
      }
      content += `"${key.key}" = "${escapedTranslation}";\n\n`;
    }
  });

  return {
    content,
    filename: `Localizable.strings`
  };
}

/**
 * Export as Android XML format
 */
export function exportAndroidXml(keys: TranslationKey[], languageCode: string): ExportResult {
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<resources>\n';

  keys.forEach(key => {
    const translation = key.translations[languageCode];
    if (translation) {
      const androidTranslation = convertToAndroidFormat(translation);
      const escapedTranslation = escapeXml(androidTranslation);

      if (key.description) {
        xml += `  <!-- ${escapeXml(key.description)} -->\n`;
      }
      xml += `  <string name="${key.key}">${escapedTranslation}</string>\n`;
    }
  });

  xml += '</resources>\n';

  return {
    content: xml,
    filename: `strings.xml`
  };
}

/**
 * Export as Flutter ARB format
 */
export function exportFlutterArb(keys: TranslationKey[], languageCode: string): ExportResult {
  const arb: Record<string, any> = {
    '@@locale': languageCode,
    '@@last_modified': new Date().toISOString()
  };

  keys.forEach(key => {
    const translation = key.translations[languageCode];
    if (translation) {
      const flutterTranslation = convertToFlutterFormat(translation);
      arb[key.key] = flutterTranslation;

      // Add metadata
      const metadata: any = {};
      if (key.description) {
        metadata.description = key.description;
      }

      // Extract placeholders from translation
      const placeholders = extractPlaceholders(flutterTranslation);
      if (placeholders.length > 0) {
        metadata.placeholders = {};
        placeholders.forEach(placeholder => {
          metadata.placeholders[placeholder] = {
            type: 'String'
          };
        });
      }

      if (Object.keys(metadata).length > 0) {
        arb[`@${key.key}`] = metadata;
      }
    }
  });

  return {
    content: JSON.stringify(arb, null, 2),
    filename: `intl_${languageCode}.arb`
  };
}

/**
 * Export translations in the specified format
 */
export function exportTranslations(
  keys: TranslationKey[],
  languageCode: string,
  format: ExportFormat
): ExportResult {
  switch (format) {
    case 'json':
      return exportFlatJson(keys, languageCode);
    case 'json-nested':
      return exportNestedJson(keys, languageCode);
    case 'ios':
      return exportIosStrings(keys, languageCode);
    case 'android':
      return exportAndroidXml(keys, languageCode);
    case 'flutter':
      return exportFlutterArb(keys, languageCode);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}

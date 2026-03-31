/**
 * Standalone syntax highlighter using highlight.js.
 *
 * Highlights code without a full CodeMirror EditorView.
 * Outputs HTML strings with `hljs-*` CSS classes (already styled in index.css).
 */

import hljs from 'highlight.js/lib/core';

// Import only the languages we actually use (tree-shake ~800 KB vs full highlight.js)
import langBash from 'highlight.js/lib/languages/bash';
import langC from 'highlight.js/lib/languages/c';
import langCMake from 'highlight.js/lib/languages/cmake';
import langCpp from 'highlight.js/lib/languages/cpp';
import langCSharp from 'highlight.js/lib/languages/csharp';
import langCss from 'highlight.js/lib/languages/css';
import langDart from 'highlight.js/lib/languages/dart';
import langDockerfile from 'highlight.js/lib/languages/dockerfile';
import langElixir from 'highlight.js/lib/languages/elixir';
import langErlang from 'highlight.js/lib/languages/erlang';
import langGo from 'highlight.js/lib/languages/go';
import langGraphQL from 'highlight.js/lib/languages/graphql';
import langHaskell from 'highlight.js/lib/languages/haskell';
import langIni from 'highlight.js/lib/languages/ini';
import langJava from 'highlight.js/lib/languages/java';
import langJavaScript from 'highlight.js/lib/languages/javascript';
import langJson from 'highlight.js/lib/languages/json';
import langKotlin from 'highlight.js/lib/languages/kotlin';
import langLess from 'highlight.js/lib/languages/less';
import langLua from 'highlight.js/lib/languages/lua';
import langMakefile from 'highlight.js/lib/languages/makefile';
import langMarkdown from 'highlight.js/lib/languages/markdown';
import langObjectiveC from 'highlight.js/lib/languages/objectivec';
import langPerl from 'highlight.js/lib/languages/perl';
import langPhp from 'highlight.js/lib/languages/php';
import langProtobuf from 'highlight.js/lib/languages/protobuf';
import langPython from 'highlight.js/lib/languages/python';
import langR from 'highlight.js/lib/languages/r';
import langRuby from 'highlight.js/lib/languages/ruby';
import langRust from 'highlight.js/lib/languages/rust';
import langScala from 'highlight.js/lib/languages/scala';
import langScss from 'highlight.js/lib/languages/scss';
import langSql from 'highlight.js/lib/languages/sql';
import langSwift from 'highlight.js/lib/languages/swift';
import langTypeScript from 'highlight.js/lib/languages/typescript';
import langXml from 'highlight.js/lib/languages/xml';
import langYaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('bash', langBash);
hljs.registerLanguage('c', langC);
hljs.registerLanguage('cmake', langCMake);
hljs.registerLanguage('cpp', langCpp);
hljs.registerLanguage('csharp', langCSharp);
hljs.registerLanguage('css', langCss);
hljs.registerLanguage('dart', langDart);
hljs.registerLanguage('dockerfile', langDockerfile);
hljs.registerLanguage('elixir', langElixir);
hljs.registerLanguage('erlang', langErlang);
hljs.registerLanguage('go', langGo);
hljs.registerLanguage('graphql', langGraphQL);
hljs.registerLanguage('haskell', langHaskell);
hljs.registerLanguage('ini', langIni);
hljs.registerLanguage('java', langJava);
hljs.registerLanguage('javascript', langJavaScript);
hljs.registerLanguage('json', langJson);
hljs.registerLanguage('kotlin', langKotlin);
hljs.registerLanguage('less', langLess);
hljs.registerLanguage('lua', langLua);
hljs.registerLanguage('makefile', langMakefile);
hljs.registerLanguage('markdown', langMarkdown);
hljs.registerLanguage('objectivec', langObjectiveC);
hljs.registerLanguage('perl', langPerl);
hljs.registerLanguage('php', langPhp);
hljs.registerLanguage('protobuf', langProtobuf);
hljs.registerLanguage('python', langPython);
hljs.registerLanguage('r', langR);
hljs.registerLanguage('ruby', langRuby);
hljs.registerLanguage('rust', langRust);
hljs.registerLanguage('scala', langScala);
hljs.registerLanguage('scss', langScss);
hljs.registerLanguage('sql', langSql);
hljs.registerLanguage('swift', langSwift);
hljs.registerLanguage('typescript', langTypeScript);
hljs.registerLanguage('xml', langXml);
hljs.registerLanguage('yaml', langYaml);

// =============================================================================
// File extension → highlight.js language mapping
// =============================================================================

const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'xml',
  '.htm': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.md': 'markdown',
  '.toml': 'ini',
  '.ini': 'ini',
  '.lua': 'lua',
  '.r': 'r',
  '.scala': 'scala',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.pl': 'perl',
  '.pm': 'perl',
  '.m': 'objectivec',
  '.mm': 'objectivec',
  '.makefile': 'makefile',
  '.cmake': 'cmake',
  '.dockerfile': 'dockerfile',
  '.tf': 'ini',
  '.proto': 'protobuf',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.vue': 'xml',
  '.svelte': 'xml',
};

function getLanguage(fileName: string): string | undefined {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1) return undefined;
  const ext = fileName.slice(dotIndex).toLowerCase();

  // Explicit map first, then try extension as hljs alias (e.g. 'rb', 'py')
  const mapped = EXT_TO_LANG[ext];
  if (mapped) return mapped;

  const bare = ext.slice(1); // '.ts' → 'ts'
  if (bare && hljs.getLanguage(bare)) return bare;

  return undefined;
}

// =============================================================================
// HTML line splitting
// =============================================================================

/** Escape HTML and split into plain-text lines (fallback for unknown languages). */
function escapeAndSplit(code: string): string[] {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.split('\n');
}

/**
 * Split highlight.js HTML output into per-line strings with balanced tags.
 * Multi-line spans (comments, strings) are properly closed/reopened at line breaks.
 */
function splitHtmlByLines(html: string): string[] {
  const rawLines = html.split('\n');
  const result: string[] = [];
  const openTags: string[] = [];

  for (const rawLine of rawLines) {
    // Prefix with any spans still open from previous lines
    const prefix = openTags.join('');
    const fullLine = prefix + rawLine;

    // Update open tags stack by scanning this line's tags
    const tagRegex = /<span[^>]*>|<\/span>/g;
    let match;
    while ((match = tagRegex.exec(rawLine)) !== null) {
      if (match[0] === '</span>') {
        if (openTags.length > 0) openTags.pop();
      } else {
        openTags.push(match[0]);
      }
    }

    // Close any unclosed spans for this line
    const suffix = '</span>'.repeat(openTags.length);
    result.push(fullLine + suffix);
  }

  return result;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Highlight code and return per-line HTML strings with `hljs-*` CSS classes.
 * Uses highlight.js (same library as rehype-highlight in markdown rendering).
 */
export function highlightLines(code: string, fileName: string): string[] {
  if (!code) return [''];

  const lang = getLanguage(fileName);

  let highlighted: string;
  if (!lang) {
    // Unknown extension — plain text is safer than unreliable auto-detection
    return escapeAndSplit(code);
  }

  try {
    highlighted = hljs.highlight(code, { language: lang }).value;
  } catch {
    return escapeAndSplit(code);
  }

  return splitHtmlByLines(highlighted);
}

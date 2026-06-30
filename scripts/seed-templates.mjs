/**
 * Seed the built-in caption templates into the `render_templates` table.
 *
 * Spec Section C.11 lists ~22 quick-preset caption templates and Section G
 * lists 15 "template bawaan". We seed all ~22 with a single consistent JSON
 * schema (the Karaoke example from spec C.11 extended with hook_style /
 * layout_style / export_settings) so the configure page and editor can read
 * them uniformly.
 *
 * Idempotent: built-in rows are deleted by template_id then re-inserted,
 * so re-running the script never produces duplicates and never touches
 * user-created templates.
 *
 * Usage:  node scripts/seed-templates.mjs
 */
import { createClient } from '@libsql/client';
import { readFile } from 'fs/promises';
import path from 'path';

async function loadDotEnv() {
  try {
    const content = await readFile(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (!process.env[key]) process.env[key] = valueParts.join('=');
    }
  } catch {
    /* no .env — rely on environment */
  }
}

await loadDotEnv();

const databaseUrl = process.env.DATABASE_URL || 'file:local.db';
const db = createClient({ url: databaseUrl, authToken: process.env.DATABASE_AUTH_TOKEN });

function now() {
  return new Date().toISOString();
}

/**
 * @typedef {Object} CaptionStyle
 * @property {string} id
 * @property {string} name
 * @property {string} fontFamily
 * @property {number} fontSize
 * @property {number} fontWeight
 * @property {string} textColor
 * @property {string} strokeColor
 * @property {number} strokeWidth
 * @property {boolean} highlightEnabled
 * @property {string} highlightColor
 * @property {boolean} uppercase
 * @property {string} animation
 * @property {string} position
 * @property {number} maxWordsPerLine
 * @property {boolean} shadow
 * @property {string} shadowColor
 * @property {string} backgroundColor
 */

const FONT = 'Inter';

/**
 * Build a caption style. Centralised so every template shares the same keys.
 */
function style(overrides) {
  return {
    fontFamily: FONT,
    fontSize: 58,
    fontWeight: 900,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 8,
    highlightEnabled: true,
    highlightColor: '#22C55E',
    uppercase: true,
    animation: 'pop',
    position: 'bottom',
    maxWordsPerLine: 4,
    shadow: true,
    shadowColor: '#000000',
    backgroundColor: '#00000000',
    ...overrides,
  };
}

const defaultHook = {
  text: '',
  position: 'top',
  fontSize: 72,
  fontWeight: 900,
  textColor: '#FFFFFF',
  backgroundColor: '#00000000',
  strokeColor: '#000000',
  strokeWidth: 6,
  startTime: 0,
  endTime: 4,
  animation: 'scale-in',
};

const defaultLayout = { mode: '9:16', aspectRatio: '9:16' };

const defaultExport = { resolution: '1080x1920', format: 'mp4', quality: 'standard', videoBitrate: '6M', audioBitrate: '128k' };

/**
 * The 22 built-in caption presets (spec Section C.11 quick presets).
 * "No caption" is included as a disabled-caption preset.
 */
const templates = [
  {
    id: 'no-caption',
    name: 'No caption',
    caption: style({ highlightEnabled: false, animation: 'none', strokeWidth: 0, uppercase: false }),
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    caption: style({ highlightColor: '#22C55E', animation: 'karaoke', fontWeight: 900 }),
  },
  {
    id: 'beasty',
    name: 'Beasty',
    caption: style({ fontSize: 64, fontWeight: 900, strokeWidth: 10, highlightColor: '#FACC15', animation: 'pop' }),
  },
  {
    id: 'deep-diver',
    name: 'Deep Diver',
    caption: style({ fontFamily: FONT, fontSize: 52, fontWeight: 800, textColor: '#E0F2FE', strokeColor: '#0C4A6E', strokeWidth: 6, highlightColor: '#38BDF8', animation: 'fade' }),
  },
  {
    id: 'youshaei',
    name: 'Youshaei',
    caption: style({ fontSize: 56, fontWeight: 800, textColor: '#FFFFFF', strokeColor: '#1E293B', strokeWidth: 4, highlightColor: '#EF4444', animation: 'pop', maxWordsPerLine: 3 }),
  },
  {
    id: 'pod-p',
    name: 'Pod P',
    caption: style({ fontSize: 54, fontWeight: 700, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 6, highlightColor: '#A855F7', animation: 'fade', uppercase: false }),
  },
  {
    id: 'mozi',
    name: 'Mozi',
    caption: style({ fontSize: 60, fontWeight: 900, textColor: '#FFFFFF', strokeColor: '#7C3AED', strokeWidth: 8, highlightColor: '#FBBF24', animation: 'slide' }),
  },
  {
    id: 'popline',
    name: 'Popline',
    caption: style({ fontSize: 58, fontWeight: 900, textColor: '#FFFFFF', strokeColor: '#EC4899', strokeWidth: 7, highlightColor: '#F472B6', animation: 'pop' }),
  },
  {
    id: 'glitch-infinite',
    name: 'Glitch Infinite',
    caption: style({ fontSize: 60, fontWeight: 900, textColor: '#22D3EE', strokeColor: '#0F172A', strokeWidth: 8, highlightColor: '#F472B6', animation: 'glitch' }),
  },
  {
    id: 'seamless-bounce',
    name: 'Seamless Bounce',
    caption: style({ fontSize: 56, fontWeight: 800, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 6, highlightColor: '#34D399', animation: 'bounce' }),
  },
  {
    id: 'baby-earthquake',
    name: 'Baby Earthquake',
    caption: style({ fontSize: 62, fontWeight: 900, textColor: '#FEF3C7', strokeColor: '#7C2D12', strokeWidth: 9, highlightColor: '#F59E0B', animation: 'pop' }),
  },
  {
    id: 'blur-switch',
    name: 'Blur Switch',
    caption: style({ fontSize: 56, fontWeight: 800, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 5, highlightColor: '#60A5FA', animation: 'fade', shadow: false }),
  },
  {
    id: 'highlighter-box',
    name: 'Highlighter Box',
    caption: style({ fontSize: 54, fontWeight: 800, textColor: '#000000', strokeColor: '#000000', strokeWidth: 0, highlightEnabled: true, highlightColor: '#FDE047', animation: 'pop', backgroundColor: '#FDE047', shadow: false }),
  },
  {
    id: 'simple',
    name: 'Simple',
    caption: style({ fontSize: 52, fontWeight: 700, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 4, highlightEnabled: false, animation: 'fade', uppercase: false, shadow: true }),
  },
  {
    id: 'think-media',
    name: 'Think Media',
    caption: style({ fontSize: 56, fontWeight: 900, textColor: '#FFFFFF', strokeColor: '#1D4ED8', strokeWidth: 6, highlightColor: '#FBBF24', animation: 'pop', position: 'bottom' }),
  },
  {
    id: 'focus',
    name: 'Focus',
    caption: style({ fontSize: 58, fontWeight: 900, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 7, highlightColor: '#EF4444', animation: 'pop', maxWordsPerLine: 2 }),
  },
  {
    id: 'blur-in',
    name: 'Blur In',
    caption: style({ fontSize: 56, fontWeight: 800, textColor: '#FFFFFF', strokeColor: '#111827', strokeWidth: 5, highlightColor: '#818CF8', animation: 'fade', shadow: true }),
  },
  {
    id: 'with-backdrop',
    name: 'With Backdrop',
    caption: style({ fontSize: 54, fontWeight: 800, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 4, highlightColor: '#22D3EE', animation: 'pop', backgroundColor: '#000000CC', shadow: false }),
  },
  {
    id: 'soft-landing',
    name: 'Soft Landing',
    caption: style({ fontSize: 54, fontWeight: 700, textColor: '#F8FAFC', strokeColor: '#334155', strokeWidth: 4, highlightColor: '#A78BFA', animation: 'slide', uppercase: false }),
  },
  {
    id: 'baby-steps',
    name: 'Baby Steps',
    caption: style({ fontSize: 50, fontWeight: 700, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 5, highlightColor: '#FCD34D', animation: 'pop', maxWordsPerLine: 5 }),
  },
  {
    id: 'grow',
    name: 'Grow',
    caption: style({ fontSize: 56, fontWeight: 900, textColor: '#FFFFFF', strokeColor: '#065F46', strokeWidth: 6, highlightColor: '#10B981', animation: 'scale-in' }),
  },
  {
    id: 'breathe',
    name: 'Breathe',
    caption: style({ fontSize: 54, fontWeight: 700, textColor: '#E2E8F0', strokeColor: '#0F172A', strokeWidth: 4, highlightColor: '#38BDF8', animation: 'fade', uppercase: false, shadow: true }),
  },
];

async function seed() {
  const templateIds = templates.map((t) => t.id);

  // Delete only built-in rows that match our ids (never touch user templates).
  const placeholders = templateIds.map(() => '?').join(',');
  await db.execute({
    sql: `DELETE FROM render_templates WHERE template_id IN (${placeholders}) AND is_builtin = 1`,
    args: templateIds,
  });

  // Ensure exactly one default. Mark "karaoke" as the default caption preset.
  for (const t of templates) {
    const isDefault = t.id === 'karaoke';
    const caption = { ...t.caption, id: t.id, name: t.name };
    await db.execute({
      sql: `INSERT INTO render_templates
            (template_id, name, type, is_builtin, is_default, caption_style, hook_style, layout_style, logo_style, export_settings, created_at, updated_at)
            VALUES (?, ?, 'caption', 1, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      args: [
        t.id,
        t.name,
        isDefault ? 1 : 0,
        JSON.stringify(caption),
        JSON.stringify(defaultHook),
        JSON.stringify(defaultLayout),
        JSON.stringify(defaultExport),
        now(),
        now(),
      ],
    });
  }

  const count = await db.execute({ sql: 'SELECT COUNT(*) as n FROM render_templates WHERE is_builtin = 1', args: [] });
  const total = await db.execute({ sql: 'SELECT COUNT(*) as n FROM render_templates', args: [] });
  console.log(`Seeded ${templates.length} built-in caption templates.`);
  console.log(`Built-in rows: ${count.rows[0].n}, total render_templates rows: ${total.rows[0].n}.`);
  console.log('Default preset: karaoke');
}

try {
  await seed();
  process.exit(0);
} catch (error) {
  console.error('Failed to seed templates:', error);
  process.exit(1);
}

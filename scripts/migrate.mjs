#!/usr/bin/env node
/**
 * migrate.mjs — Runner de migraciones versionadas
 *
 * Modelo: un archivo SQL por cambio de schema, nombrado con timestamp.
 * La tabla `schema_migrations` registra qué se aplicó y cuándo.
 * Solo se aplican las migraciones pendientes, en orden estricto.
 *
 * Uso:
 *   node scripts/migrate.mjs              → aplica pendientes
 *   node scripts/migrate.mjs --status     → muestra estado de todas
 *   node scripts/migrate.mjs --dry-run    → muestra qué se aplicaría sin ejecutar
 */

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// ── Configuración ────────────────────────────────────────────────────────────

const databaseUrl = process.env.SUPABASE_DATABASE_URL;

if (!databaseUrl) {
  console.log('⚠  SUPABASE_DATABASE_URL no configurada — saltando migraciones.');
  process.exit(0);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isStatus = args.includes('--status');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌  Directorio de migraciones no encontrado: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()  // orden lexicográfico = orden de timestamp
    .map(filename => {
      const version = filename.split('_')[0];            // 20260301000000
      const name    = filename.replace(/\.sql$/, '')
                              .replace(/^\d{14}_/, '');  // game_metrics_and_mood_entries
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql      = fs.readFileSync(filepath, 'utf8');
      const checksum = sha256(sql);
      return { version, name, filename, filepath, sql, checksum };
    });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sql = postgres(databaseUrl, { ssl: 'require', max: 1 });

try {
  // Asegurar que la tabla de control existe (bootstrapping)
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(14)  PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ  DEFAULT NOW(),
      checksum   VARCHAR(64)
    )
  `;

  const applied = await sql`SELECT version, checksum FROM schema_migrations ORDER BY version`;
  const appliedMap = Object.fromEntries(applied.map(r => [r.version, r.checksum]));

  const files = getMigrationFiles();

  if (isStatus) {
    console.log('\n📋  Estado de migraciones:\n');
    for (const m of files) {
      const wasApplied = m.version in appliedMap;
      const drifted    = wasApplied && appliedMap[m.version] !== m.checksum;
      const icon = drifted ? '⚠ ' : wasApplied ? '✅' : '⏳';
      const note = drifted ? '  ← DRIFT: el SQL cambió después de aplicarse' : '';
      console.log(`  ${icon}  ${m.version}  ${m.name}${note}`);
    }
    console.log('');
    await sql.end();
    process.exit(0);
  }

  // Detectar drift (migraciones aplicadas cuyo SQL cambió — nunca debe pasar)
  for (const m of files) {
    if (m.version in appliedMap && appliedMap[m.version] !== m.checksum) {
      console.error(`\n🚨  DRIFT detectado en migración ${m.version} (${m.name})`);
      console.error(`    El archivo SQL fue modificado después de aplicarse.`);
      console.error(`    Nunca edites migraciones ya aplicadas. Creá una nueva.\n`);
      await sql.end();
      process.exit(1);
    }
  }

  const pending = files.filter(m => !(m.version in appliedMap));

  if (pending.length === 0) {
    console.log('✅  Base de datos al día. No hay migraciones pendientes.');
    await sql.end();
    process.exit(0);
  }

  console.log(`\n🔄  ${pending.length} migración(es) pendiente(s):\n`);

  for (const m of pending) {
    console.log(`  ⏳  ${m.version}  ${m.name}`);

    if (isDryRun) {
      console.log(`      [dry-run] se saltea la ejecución\n`);
      continue;
    }

    try {
      // Ejecutar el SQL de la migración
      await sql.unsafe(m.sql);

      // Registrar como aplicada
      await sql`
        INSERT INTO schema_migrations (version, name, checksum)
        VALUES (${m.version}, ${m.name}, ${m.checksum})
        ON CONFLICT (version) DO NOTHING
      `;

      console.log(`  ✅  ${m.version}  ${m.name}  — aplicada\n`);
    } catch (err) {
      console.error(`  ❌  ${m.version}  ${m.name}  — FALLÓ:`);
      console.error(`      ${err.message}\n`);
      console.error('  La migración falló. Las siguientes NO se aplicarán.');
      await sql.end();
      process.exit(1);
    }
  }

  if (!isDryRun) {
    console.log('✅  Todas las migraciones aplicadas correctamente.\n');
  }

} catch (err) {
  console.error('❌  Error conectando a la base de datos:', err.message);
  process.exit(0);  // No fallar el build si DB no responde
} finally {
  await sql.end();
}

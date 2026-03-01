# Sistema de Migraciones

## Filosofía

**Una migración = un archivo SQL = un cambio irreversible.**

Nunca se edita una migración ya aplicada. Si algo está mal, se crea una nueva migración que lo corrija. La tabla `schema_migrations` en Supabase es la única fuente de verdad sobre qué se aplicó y cuándo.

---

## Estructura

```
migrations/
  20260114000000_initial_schema.sql
  20260301000000_game_metrics_and_mood_entries.sql
  YYYYMMDDHHMMSS_descripcion_en_snake_case.sql   ← próximas
```

El nombre tiene dos partes separadas por `_`:
- **Timestamp** (`YYYYMMDDHHMMSS`) — determina el orden de ejecución
- **Descripción** — qué hace la migración, en snake_case

---

## Comandos

```bash
# Ver estado de todas las migraciones
npm run migrate:status

# Ver qué se aplicaría sin ejecutar nada
npm run migrate:dry

# Aplicar migraciones pendientes
npm run migrate
```

El `npm run build` (usado por Netlify en cada deploy) ejecuta `migrate` automáticamente. Si no hay pendientes, termina en segundos. Si las hay, las aplica en orden y registra cada una.

---

## Crear una migración nueva

1. Crear el archivo con timestamp del momento:
   ```bash
   # Ejemplo: agregar columna a hdd_game_metrics
   # Archivo: migrations/20260315120000_add_duration_to_game_metrics.sql
   ```

2. Escribir SQL idempotente cuando sea posible:
   ```sql
   -- Migration: add_duration_to_game_metrics
   ALTER TABLE hdd_game_metrics 
     ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
   ```

3. Commitear y pushear → Netlify deploya → el runner aplica la migración → queda registrada en `schema_migrations`.

---

## Reglas

| ✅ Hacer | ❌ Nunca |
|---------|---------|
| Crear archivo nuevo para cada cambio | Editar un `.sql` ya commiteado |
| Usar `IF NOT EXISTS` / `IF EXISTS` | Borrar archivos de `migrations/` |
| Probar con `--dry-run` antes | Modificar `schema_migrations` a mano |
| Un propósito por migración | Mezclar cambios no relacionados |

---

## Cómo funciona internamente

1. El runner lee todos los `.sql` en `migrations/` ordenados por nombre
2. Consulta `schema_migrations` para ver cuáles ya se aplicaron
3. **Detecta drift**: si un archivo ya aplicado cambió (checksum diferente), falla con error — señal de que alguien editó una migración histórica
4. Aplica los pendientes en orden, dentro de una transacción por migración
5. Registra cada una con su checksum en `schema_migrations`

Si la DB no responde (sin `SUPABASE_DATABASE_URL`), el proceso termina silenciosamente sin fallar el build.

-- Migration 012: Resources table and activity management enhancements
-- Adds database-backed resources, activity descriptions/icons, and room persistence

-- ===========================================
-- HDD RESOURCES TABLE
-- ===========================================
CREATE TABLE IF NOT EXISTS hdd_resources (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'link', -- video, document, course, link
    url TEXT NOT NULL,
    duration VARCHAR(50), -- e.g. "15 min", "4 modulos"
    icon VARCHAR(10), -- emoji icon override
    category VARCHAR(100), -- e.g. "relajacion", "habilidades-sociales"
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_by VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed default resources
INSERT INTO hdd_resources (title, description, resource_type, url, duration, sort_order)
VALUES
    ('Tecnicas de Relajacion', 'Video introductorio sobre tecnicas de respiracion y relajacion muscular progresiva.', 'video', 'https://www.youtube.com/watch?v=aXItOY0sLRY', '15 min', 1),
    ('Guia de Medicacion', 'Documento sobre manejo responsable de medicacion psiquiatrica.', 'document', '#', '10 paginas', 2),
    ('Curso: Habilidades Sociales', 'Curso de 4 modulos sobre desarrollo de habilidades sociales y comunicacion asertiva.', 'course', '#', '4 modulos', 3),
    ('Mindfulness para Principiantes', 'Sesion guiada de meditacion mindfulness para principiantes.', 'video', 'https://www.youtube.com/watch?v=ZToicYcHIqU', '20 min', 4),
    ('Portal de Salud Mental', 'Enlace al portal nacional de recursos de salud mental.', 'link', 'https://www.argentina.gob.ar/salud/mental', NULL, 5)
ON CONFLICT DO NOTHING;

-- ===========================================
-- ACTIVITY ENHANCEMENTS
-- ===========================================
-- Add icon and location columns to activities if not present
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS location VARCHAR(200);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS professional VARCHAR(200);
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS max_capacity INTEGER;
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE hdd_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Set default icons for existing activities
UPDATE hdd_activities SET icon = '🎵' WHERE name ILIKE '%musica%' OR name ILIKE '%música%';
UPDATE hdd_activities SET icon = '🌱' WHERE name ILIKE '%huerta%';
UPDATE hdd_activities SET icon = '🪵' WHERE name ILIKE '%carpinter%';
UPDATE hdd_activities SET icon = '🍳' WHERE name ILIKE '%cocina%';
UPDATE hdd_activities SET icon = '💃' WHERE name ILIKE '%expresion%' OR name ILIKE '%expresión%';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hdd_resources_type ON hdd_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_hdd_resources_active ON hdd_resources(is_active);

COMMENT ON TABLE hdd_resources IS 'Educational resources, videos, courses, and links for HDD patients and professionals';

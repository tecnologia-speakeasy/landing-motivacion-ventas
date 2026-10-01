-- OPCIONAL. La landing funciona con la misma DATABASE_URL de inventario (solo
-- hace SELECT en transacciones de solo lectura). Este script es una capa extra
-- de seguridad: un usuario que, si su clave se filtrara, solo puede leer lo
-- mínimo. Requiere acceso de superusuario al servidor de Postgres.
--
-- Usuario de SOLO LECTURA para la landing de motivación de ventas,
-- en la base de inventario-speakeasy (base "system").
--
-- Los permisos son por columna: aunque la clave se filtrara, este usuario no
-- puede leer nombres, correos, teléfonos ni observaciones de los compradores,
-- ni escribir nada.
--
-- Se ejecuta en DOS PARTES porque requieren permisos distintos. Para saber
-- con qué usuario estás conectado y quién es dueño de qué:
--
--   SELECT current_user                 AS usuario,
--          r.rolsuper                   AS es_superusuario,
--          r.rolcreaterole              AS puede_crear_roles,
--          pg_get_userbyid(d.datdba)    AS dueno_base,
--          (SELECT tableowner FROM pg_tables WHERE tablename = 'cartera_compras') AS dueno_tablas
--     FROM pg_roles r, pg_database d
--    WHERE r.rolname = current_user AND d.datname = current_database();

-- =============================================================================
-- PARTE 1 · Ejecutar como SUPERUSUARIO (normalmente "postgres") o un usuario
-- con CREATEROLE. En el servidor: sudo -u postgres psql -d system
-- =============================================================================

-- ⚠ Reemplaza la clave ANTES de ejecutar. Usa solo letras y números (así no
--   hay que escaparla en la URL). Por ejemplo, genera una con:
--     node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
CREATE ROLE landing_ventas LOGIN PASSWORD 'PEGAR_AQUI_LA_CLAVE_GENERADA';

ALTER ROLE landing_ventas SET default_transaction_read_only = on;
ALTER ROLE landing_ventas CONNECTION LIMIT 20;
GRANT CONNECT ON DATABASE system TO landing_ventas;
GRANT USAGE ON SCHEMA public TO landing_ventas;

-- =============================================================================
-- PARTE 2 · Ejecutar como el DUEÑO de las tablas de cartera (el usuario con el
-- que corre inventario) o como superusuario.
-- =============================================================================

GRANT SELECT (id, producto_id, created_at) ON cartera_compras TO landing_ventas;

-- =============================================================================
-- Comprobación (conectado como landing_ventas): la primera consulta debe
-- funcionar y las otras dos deben fallar con "permission denied".
-- =============================================================================
--   SELECT count(*) FROM cartera_compras WHERE producto_id = '79e47346-0188-4aa8-b706-818b68442866';
--   SELECT nombre_completo FROM cartera_compras LIMIT 1;
--   DELETE FROM cartera_compras WHERE false;

-- Luego, en la landing (Vercel → Environment Variables), la misma URL que usa
-- inventario (host, puerto, base y parámetros) cambiando solo usuario y clave:
--   DATABASE_URL=postgresql://landing_ventas:<clave>@<mismo host>:<mismo puerto>/system

-- Para revocar el acceso:
--   REVOKE ALL ON cartera_compras FROM landing_ventas;
--   REVOKE ALL ON SCHEMA public FROM landing_ventas;
--   REVOKE CONNECT ON DATABASE system FROM landing_ventas;
--   DROP ROLE landing_ventas;

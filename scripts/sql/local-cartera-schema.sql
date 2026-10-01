-- Réplica MÍNIMA de las tablas de cartera de inventario-speakeasy, solo con
-- las columnas que lee la landing. Es para desarrollo local; en producción
-- las tablas ya existen y las gestiona inventario.

CREATE TABLE IF NOT EXISTS cartera_productos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cartera_metodos_pago (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID NOT NULL REFERENCES cartera_productos(id) ON DELETE CASCADE,
  nombre      VARCHAR(80) NOT NULL,
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (producto_id, nombre)
);

CREATE TABLE IF NOT EXISTS cartera_compras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id     UUID NOT NULL REFERENCES cartera_productos(id) ON DELETE CASCADE,
  nombre_completo VARCHAR(300) NOT NULL,
  metodo_pago_id  UUID REFERENCES cartera_metodos_pago(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cartera_compras_producto_idx ON cartera_compras(producto_id);

CREATE TABLE IF NOT EXISTS cartera_compras_pagos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id     UUID NOT NULL REFERENCES cartera_compras(id) ON DELETE CASCADE,
  ingresado_usd DECIMAL(12, 2),
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cartera_compras_pagos_compra_idx ON cartera_compras_pagos(compra_id);

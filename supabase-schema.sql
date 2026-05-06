-- ═══════════════════════════════════════════════════════════════════════════
-- FINANZAS APP — Schema completo
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USUARIOS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuarios (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  nombre            TEXT NOT NULL DEFAULT '',
  avatar_url        TEXT,
  moneda_principal  TEXT NOT NULL DEFAULT 'ARS',
  monedas_ahorro    TEXT[] NOT NULL DEFAULT ARRAY['USD','EUR'],
  monedas_cripto    TEXT[] NOT NULL DEFAULT ARRAY['BTC','ETH'],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_own" ON public.usuarios FOR ALL USING (auth.uid() = id);

-- Trigger: crear usuario al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nombre)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── INGRESOS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ingresos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  año         SMALLINT NOT NULL,
  mes         SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  tipo        TEXT NOT NULL DEFAULT 'otro',
  monto       NUMERIC(15,2) NOT NULL CHECK (monto >= 0),
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  descripcion TEXT NOT NULL DEFAULT '',
  fecha       DATE NOT NULL,
  quien       TEXT NOT NULL DEFAULT 'ambos',
  recurrente  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingresos_own" ON public.ingresos FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_ingresos_user_año_mes ON public.ingresos(user_id, año, mes);

-- ─── EGRESOS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.egresos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  año         SMALLINT NOT NULL,
  mes         SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria   TEXT NOT NULL DEFAULT 'otro',
  monto       NUMERIC(15,2) NOT NULL CHECK (monto >= 0),
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  descripcion TEXT NOT NULL DEFAULT '',
  fecha       DATE NOT NULL,
  quien       TEXT NOT NULL DEFAULT 'ambos',
  recurrente  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.egresos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "egresos_own" ON public.egresos FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_egresos_user_año_mes ON public.egresos(user_id, año, mes);

-- ─── DEUDAS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deudas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  banco             TEXT NOT NULL DEFAULT '',
  total_original    NUMERIC(15,2) NOT NULL CHECK (total_original >= 0),
  pendiente         NUMERIC(15,2) NOT NULL CHECK (pendiente >= 0),
  cuota_mensual     NUMERIC(15,2) NOT NULL CHECK (cuota_mensual >= 0),
  tasa_interes      NUMERIC(6,3) NOT NULL DEFAULT 0,
  moneda            TEXT NOT NULL DEFAULT 'ARS',
  fecha_inicio      DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  cuota_actual      SMALLINT NOT NULL DEFAULT 1,
  cuota_total       SMALLINT NOT NULL DEFAULT 1,
  color             TEXT NOT NULL DEFAULT '#5B3FA6',
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.deudas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deudas_own" ON public.deudas FOR ALL USING (auth.uid() = user_id);

-- ─── PAGOS DE DEUDA (historial) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_deuda (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deuda_id    UUID NOT NULL REFERENCES public.deudas(id) ON DELETE CASCADE,
  fecha       DATE NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  monto       NUMERIC(15,2) NOT NULL CHECK (monto >= 0),
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.pagos_deuda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pagos_deuda_own" ON public.pagos_deuda
  FOR ALL USING (deuda_id IN (SELECT id FROM public.deudas WHERE user_id = auth.uid()));

-- ─── TARJETAS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tarjetas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre           TEXT NOT NULL,
  banco            TEXT NOT NULL DEFAULT '',
  limite           NUMERIC(15,2) NOT NULL DEFAULT 0,
  moneda           TEXT NOT NULL DEFAULT 'ARS',
  color            TEXT NOT NULL DEFAULT '#1A5E9E',
  icono            TEXT NOT NULL DEFAULT 'V',
  quien            TEXT NOT NULL DEFAULT 'ambos',
  dia_cierre       SMALLINT DEFAULT 1 CHECK (dia_cierre BETWEEN 1 AND 31),
  dia_vencimiento  SMALLINT DEFAULT 10 CHECK (dia_vencimiento BETWEEN 1 AND 31),
  activa           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.tarjetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarjetas_own" ON public.tarjetas FOR ALL USING (auth.uid() = user_id);

-- ─── TRANSACCIONES DE TARJETA ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tarjeta_transacciones (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarjeta_id       UUID NOT NULL REFERENCES public.tarjetas(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  categoria        TEXT NOT NULL DEFAULT 'Otros',
  fecha            DATE NOT NULL,
  monto            NUMERIC(15,2) NOT NULL CHECK (monto >= 0),
  moneda           TEXT NOT NULL DEFAULT 'ARS',
  cotizacion_ars   NUMERIC(12,2),
  cuota_actual     SMALLINT,
  cuota_total      SMALLINT,
  tipo             TEXT NOT NULL DEFAULT 'debito' CHECK (tipo IN ('debito','credito')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.tarjeta_transacciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tt_own" ON public.tarjeta_transacciones
  FOR ALL USING (tarjeta_id IN (SELECT id FROM public.tarjetas WHERE user_id = auth.uid()));
CREATE INDEX idx_tt_tarjeta_fecha ON public.tarjeta_transacciones(tarjeta_id, fecha);

-- ─── PAGOS DE TARJETA (resumen mensual) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_tarjeta (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tarjeta_id  UUID NOT NULL REFERENCES public.tarjetas(id) ON DELETE CASCADE,
  año         SMALLINT NOT NULL,
  mes         SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto       NUMERIC(15,2) NOT NULL CHECK (monto >= 0),
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  fecha_pago  DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tarjeta_id, año, mes)
);
ALTER TABLE public.pagos_tarjeta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt_own" ON public.pagos_tarjeta
  FOR ALL USING (tarjeta_id IN (SELECT id FROM public.tarjetas WHERE user_id = auth.uid()));

-- ─── EVENTOS CALENDARIO ──────────────────────────────────────────────────────
-- Fuente única para Calendario + Cash Flow
CREATE TABLE IF NOT EXISTS public.eventos_calendario (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dia         SMALLINT NOT NULL CHECK (dia BETWEEN 1 AND 31),
  mes         SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  año         SMALLINT NOT NULL,
  tipo        TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto       NUMERIC(15,2),
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  recurrente  BOOLEAN NOT NULL DEFAULT FALSE,
  pagado      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.eventos_calendario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eventos_own" ON public.eventos_calendario FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_eventos_user_año_mes ON public.eventos_calendario(user_id, año, mes);

-- ─── SALDO INICIAL (cash flow) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saldo_inicial (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  año         SMALLINT NOT NULL,
  mes         SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto       NUMERIC(15,2) NOT NULL DEFAULT 0,
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, año, mes)
);
ALTER TABLE public.saldo_inicial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saldo_own" ON public.saldo_inicial FOR ALL USING (auth.uid() = user_id);

-- ─── METAS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.metas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  monto_objetivo  NUMERIC(15,2) NOT NULL CHECK (monto_objetivo > 0),
  monto_actual    NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (monto_actual >= 0),
  moneda          TEXT NOT NULL DEFAULT 'USD',
  fecha_limite    DATE NOT NULL,
  icono           TEXT NOT NULL DEFAULT '🎯',
  color           TEXT NOT NULL DEFAULT '#1A5E9E',
  completada      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metas_own" ON public.metas FOR ALL USING (auth.uid() = user_id);

-- ─── PRECIOS — Items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.precio_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'Otro',
  icono       TEXT NOT NULL DEFAULT '📦',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.precio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_own" ON public.precio_items FOR ALL USING (auth.uid() = user_id);

-- ─── PRECIOS — Historial ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.precio_historial (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID NOT NULL REFERENCES public.precio_items(id) ON DELETE CASCADE,
  mes         TEXT NOT NULL,  -- 'YYYY-MM'
  valor       NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  moneda      TEXT NOT NULL DEFAULT 'ARS',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, mes)
);
ALTER TABLE public.precio_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ph_own" ON public.precio_historial
  FOR ALL USING (item_id IN (SELECT id FROM public.precio_items WHERE user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- VISTAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.ingresos_por_mes AS
SELECT user_id, año, mes, moneda,
  SUM(monto) FILTER (WHERE tipo='salario')    AS salario,
  SUM(monto) FILTER (WHERE tipo='freelance')  AS freelance,
  SUM(monto) FILTER (WHERE tipo='alquiler')   AS alquiler,
  SUM(monto) FILTER (WHERE tipo='otro')       AS otro,
  SUM(monto)                                   AS total
FROM public.ingresos
GROUP BY user_id, año, mes, moneda;

CREATE OR REPLACE VIEW public.egresos_por_mes AS
SELECT user_id, año, mes, moneda,
  SUM(monto) FILTER (WHERE categoria='tarjeta')   AS tarjeta,
  SUM(monto) FILTER (WHERE categoria='usd')        AS usd,
  SUM(monto) FILTER (WHERE categoria='servicios')  AS servicios,
  SUM(monto) FILTER (WHERE categoria='oli')        AS oli,
  SUM(monto) FILTER (WHERE categoria='casa')       AS casa,
  SUM(monto) FILTER (WHERE categoria='social')     AS social,
  SUM(monto) FILTER (WHERE categoria='expensas')   AS expensas,
  SUM(monto) FILTER (WHERE categoria='salud')      AS salud,
  SUM(monto) FILTER (WHERE categoria='super')      AS super,
  SUM(monto) FILTER (WHERE categoria='impuestos')  AS impuestos,
  SUM(monto) FILTER (WHERE categoria='viajes')     AS viajes,
  SUM(monto) FILTER (WHERE categoria='auto')       AS auto,
  SUM(monto) FILTER (WHERE categoria='educacion')  AS educacion,
  SUM(monto) FILTER (WHERE categoria='otro')       AS otro,
  SUM(monto)                                        AS total
FROM public.egresos
GROUP BY user_id, año, mes, moneda;

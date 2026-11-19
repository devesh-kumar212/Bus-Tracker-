-- ============================================================
-- SUPABASE DATABASE SCHEMA FOR BUS TRACKER AUTHENTICATION
-- Run this script in your Supabase SQL Editor if tables are not yet created.
-- ============================================================

-- 1. Create PROFILES Table (Linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('passenger', 'driver', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create DRIVERS Table (Linked to profiles and Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  route TEXT NOT NULL,
  bus_number TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  is_tracking BOOLEAN DEFAULT false,
  tracking_status TEXT DEFAULT 'inactive',
  last_tracking_started_at TIMESTAMP WITH TIME ZONE,
  last_tracking_stopped_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alter table statements if table already exists
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS is_tracking BOOLEAN DEFAULT false;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS tracking_status TEXT DEFAULT 'inactive';
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS last_tracking_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS last_tracking_stopped_at TIMESTAMP WITH TIME ZONE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_user_id_unique ON public.drivers(user_id);

-- Create the application profile and pending driver assignment as part of
-- Auth signup, including when Supabase email confirmation delays the session.
CREATE OR REPLACE FUNCTION public.handle_trackmybus_auth_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  account_role TEXT;
  display_name TEXT;
BEGIN
  account_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'driver' THEN 'driver' ELSE 'passenger' END;
  display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, name, role, status)
  VALUES (NEW.id, NEW.email, display_name, account_role, CASE WHEN account_role = 'driver' THEN 'pending' ELSE 'active' END)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role;

  IF account_role = 'driver' THEN
    IF NULLIF(NEW.raw_user_meta_data->>'bus_number', '') IS NULL OR NULLIF(NEW.raw_user_meta_data->>'route', '') IS NULL THEN
      RAISE EXCEPTION 'Driver signup requires a bus number and route.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.drivers (user_id, name, email, route, bus_number, approval_status)
    VALUES (NEW.id, display_name, NEW.email, NEW.raw_user_meta_data->>'route', UPPER(NEW.raw_user_meta_data->>'bus_number'), 'pending')
    ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,
      route = EXCLUDED.route, bus_number = EXCLUDED.bus_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_trackmybus_auth_signup ON auth.users;
CREATE TRIGGER on_trackmybus_auth_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_trackmybus_auth_signup();

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_trackmybus_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin');
$$;

-- 4. Restrict profiles to their owner and authenticated admins.
DROP POLICY IF EXISTS "Public select profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles owner or admin read" ON public.profiles;
CREATE POLICY "Profiles owner or admin read" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_trackmybus_admin());

DROP POLICY IF EXISTS "Public insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles owner insert" ON public.profiles;
CREATE POLICY "Profiles owner insert" ON public.profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND role IN ('passenger', 'driver'));

DROP POLICY IF EXISTS "Public update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles admin update" ON public.profiles;
CREATE POLICY "Profiles admin update" ON public.profiles FOR UPDATE TO authenticated
USING (public.is_trackmybus_admin())
WITH CHECK (public.is_trackmybus_admin());

DROP POLICY IF EXISTS "Public delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles admin delete" ON public.profiles;
CREATE POLICY "Profiles admin delete" ON public.profiles FOR DELETE TO authenticated
USING (public.is_trackmybus_admin());

-- 5. Driver assignments are private. Driver clients can read their own assignment;
-- only admins can approve, reassign, or remove drivers.
DROP POLICY IF EXISTS "Public select drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers owner or admin read" ON public.drivers;
CREATE POLICY "Drivers owner or admin read" ON public.drivers FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_trackmybus_admin());

DROP POLICY IF EXISTS "Public insert drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers owner pending insert" ON public.drivers;
CREATE POLICY "Drivers owner pending insert" ON public.drivers FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND approval_status = 'pending');

DROP POLICY IF EXISTS "Public update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers admin update" ON public.drivers;
CREATE POLICY "Drivers admin update" ON public.drivers FOR UPDATE TO authenticated
USING (public.is_trackmybus_admin())
WITH CHECK (public.is_trackmybus_admin());

DROP POLICY IF EXISTS "Public delete drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers admin delete" ON public.drivers;
CREATE POLICY "Drivers admin delete" ON public.drivers FOR DELETE TO authenticated
USING (public.is_trackmybus_admin());

-- 6. Create BUS_LOCATIONS Table (One current real-time GPS location per driver)
CREATE TABLE IF NOT EXISTS public.bus_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bus_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  route TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  tracking_status TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (tracking_status IN ('ACTIVE', 'OFFLINE')),
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migrate existing installs and allow a tracking session to start before its
-- first GPS fix. A bus becomes publicly visible as soon as a valid fix arrives.
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS bus_number TEXT;
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS speed DOUBLE PRECISION;
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION;
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE public.bus_locations ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.bus_locations ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.bus_locations ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE public.bus_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select bus_locations" ON public.bus_locations;
DROP POLICY IF EXISTS "Public read active bus locations" ON public.bus_locations;
DROP POLICY IF EXISTS "Public insert bus_locations" ON public.bus_locations;
DROP POLICY IF EXISTS "Public update bus_locations" ON public.bus_locations;
DROP POLICY IF EXISTS "Public delete bus_locations" ON public.bus_locations;
CREATE POLICY "Public read active bus locations" ON public.bus_locations FOR SELECT TO anon, authenticated
USING (tracking_status = 'ACTIVE' AND latitude IS NOT NULL AND longitude IS NOT NULL
  AND last_heartbeat_at > NOW() - INTERVAL '2 minutes');
GRANT SELECT ON public.bus_locations TO anon, authenticated;

-- Tracking writes are RPC-only. Each function is bound to auth.uid() and an
-- approved driver's own row; browser clients cannot write arbitrary bus IDs.
CREATE OR REPLACE FUNCTION public.start_bus_tracking()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.drivers%ROWTYPE;
BEGIN
  SELECT * INTO d FROM public.drivers WHERE user_id = auth.uid() AND approval_status = 'approved' LIMIT 1;
  IF NOT FOUND OR d.bus_number IS NULL OR d.route IS NULL THEN
    RAISE EXCEPTION 'No approved bus and route assignment was found for this driver.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bus_locations l WHERE LOWER(l.bus_number) = LOWER(d.bus_number)
    AND l.driver_id <> auth.uid() AND l.tracking_status = 'ACTIVE'
    AND l.last_heartbeat_at > NOW() - INTERVAL '2 minutes') THEN
    RAISE EXCEPTION 'This bus is already being tracked by another driver.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.bus_locations (driver_id, bus_number, driver_name, route, latitude, longitude, tracking_status, last_heartbeat_at, updated_at)
  VALUES (auth.uid(), d.bus_number, d.name, d.route, NULL, NULL, 'ACTIVE', NOW(), NOW())
  ON CONFLICT (driver_id) DO UPDATE SET bus_number = EXCLUDED.bus_number, driver_name = EXCLUDED.driver_name,
    route = EXCLUDED.route, latitude = NULL, longitude = NULL, tracking_status = 'ACTIVE',
    last_heartbeat_at = NOW(), updated_at = NOW();
  UPDATE public.drivers SET is_tracking = TRUE, tracking_status = 'active', last_tracking_started_at = NOW()
    WHERE user_id = auth.uid();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_bus_location(
  p_latitude DOUBLE PRECISION, p_longitude DOUBLE PRECISION, p_accuracy DOUBLE PRECISION DEFAULT NULL,
  p_speed DOUBLE PRECISION DEFAULT NULL, p_heading DOUBLE PRECISION DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid GPS coordinates.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bus_locations SET latitude = p_latitude, longitude = p_longitude, accuracy = p_accuracy,
    speed = p_speed, heading = p_heading, last_heartbeat_at = NOW(), updated_at = NOW()
    WHERE driver_id = auth.uid() AND tracking_status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM public.drivers WHERE user_id = auth.uid() AND approval_status = 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking session is not active for an approved driver.' USING ERRCODE = '42501'; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_bus_tracking()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.bus_locations SET last_heartbeat_at = NOW()
    WHERE driver_id = auth.uid() AND tracking_status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM public.drivers WHERE user_id = auth.uid() AND approval_status = 'approved');
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking session is not active.' USING ERRCODE = '42501'; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_bus_tracking()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.bus_locations SET tracking_status = 'OFFLINE', last_heartbeat_at = NOW(), updated_at = NOW()
    WHERE driver_id = auth.uid();
  UPDATE public.drivers SET is_tracking = FALSE, tracking_status = 'inactive', last_tracking_stopped_at = NOW()
    WHERE user_id = auth.uid();
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.start_bus_tracking() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_bus_location(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_bus_tracking() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stop_bus_tracking() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_bus_tracking() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bus_location(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_bus_tracking() TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_bus_tracking() TO authenticated;

-- 7. Indices for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_approval_status ON public.drivers(approval_status);
CREATE INDEX IF NOT EXISTS idx_bus_locations_driver_id ON public.bus_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_bus_locations_public_active ON public.bus_locations(tracking_status, last_heartbeat_at) WHERE tracking_status = 'ACTIVE';

-- 8. Enable Supabase Realtime Publication for bus_locations & drivers tables
-- Run this in your Supabase SQL Editor to ensure real-time broadcast works for public tracking:
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bus_locations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_locations;
  END IF;
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'supabase_realtime publication is unavailable; public polling remains enabled.';
END $$;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;



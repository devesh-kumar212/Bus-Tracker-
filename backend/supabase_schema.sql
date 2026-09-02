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
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for Profiles
DROP POLICY IF EXISTS "Public select profiles" ON public.profiles;
CREATE POLICY "Public select profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert profiles" ON public.profiles;
CREATE POLICY "Public insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update profiles" ON public.profiles;
CREATE POLICY "Public update profiles" ON public.profiles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete profiles" ON public.profiles;
CREATE POLICY "Public delete profiles" ON public.profiles FOR DELETE USING (true);

-- 5. Create RLS Policies for Drivers
DROP POLICY IF EXISTS "Public select drivers" ON public.drivers;
CREATE POLICY "Public select drivers" ON public.drivers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert drivers" ON public.drivers;
CREATE POLICY "Public insert drivers" ON public.drivers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update drivers" ON public.drivers;
CREATE POLICY "Public update drivers" ON public.drivers FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete drivers" ON public.drivers;
CREATE POLICY "Public delete drivers" ON public.drivers FOR DELETE USING (true);

-- 6. Create BUS_LOCATIONS Table (One current real-time GPS location per driver)
CREATE TABLE IF NOT EXISTS public.bus_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on bus_locations
ALTER TABLE public.bus_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select bus_locations" ON public.bus_locations;
CREATE POLICY "Public select bus_locations" ON public.bus_locations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert bus_locations" ON public.bus_locations;
CREATE POLICY "Public insert bus_locations" ON public.bus_locations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update bus_locations" ON public.bus_locations;
CREATE POLICY "Public update bus_locations" ON public.bus_locations FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete bus_locations" ON public.bus_locations;
CREATE POLICY "Public delete bus_locations" ON public.bus_locations FOR DELETE USING (true);

-- 7. Indices for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON public.drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_approval_status ON public.drivers(approval_status);
CREATE INDEX IF NOT EXISTS idx_bus_locations_driver_id ON public.bus_locations(driver_id);

-- 8. Enable Supabase Realtime Publication for bus_locations & drivers tables
-- Run this in your Supabase SQL Editor to ensure real-time broadcast works for public tracking:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.bus_locations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;



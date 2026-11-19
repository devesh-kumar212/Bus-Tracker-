-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'driver')) NOT NULL,
    is_approved INTEGER DEFAULT 1,
    bus_number TEXT,
    assigned_route TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Buses Table
CREATE TABLE IF NOT EXISTS buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_number TEXT UNIQUE NOT NULL,
    capacity INTEGER NOT NULL,
    status TEXT CHECK(status IN ('active', 'inactive', 'maintenance')) DEFAULT 'inactive',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Routes Table
CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_name TEXT UNIQUE NOT NULL,
    description TEXT,
    polyline TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stops Table
CREATE TABLE IF NOT EXISTS stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stop_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Route Stops (defines the sequence of stops on a route)
CREATE TABLE IF NOT EXISTS route_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    stop_id INTEGER NOT NULL,
    stop_order INTEGER NOT NULL,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE CASCADE,
    UNIQUE(route_id, stop_order)
);

-- Trips Table (instances of a bus running on a route)
CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('scheduled', 'active', 'completed', 'cancelled')) DEFAULT 'scheduled',
    start_time DATETIME,
    end_time DATETIME,
    current_latitude REAL,
    current_longitude REAL,
    last_update DATETIME,
    FOREIGN KEY (bus_id) REFERENCES buses(id),
    FOREIGN KEY (driver_id) REFERENCES users(id),
    FOREIGN KEY (route_id) REFERENCES routes(id)
);

-- Trip Location Logs (for historical breadcrumbs if needed)
CREATE TABLE IF NOT EXISTS trip_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

-- Current bus telemetry. One mutable row per assigned driver/bus; history remains in trip_logs if required.
CREATE TABLE IF NOT EXISTS bus_locations (
    driver_id TEXT PRIMARY KEY,
    bus_number TEXT NOT NULL UNIQUE,
    driver_name TEXT NOT NULL,
    driver_email TEXT,
    route TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    accuracy REAL,
    speed REAL,
    heading REAL,
    tracking_status TEXT NOT NULL CHECK(tracking_status IN ('ACTIVE', 'INACTIVE')) DEFAULT 'INACTIVE',
    last_update TEXT,
    last_heartbeat_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bus_locations_status_heartbeat
    ON bus_locations(tracking_status, last_heartbeat_at);

-- OTP challenges and one-time signup proofs must survive API restarts.
CREATE TABLE IF NOT EXISTS email_verifications (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    otp_hash TEXT,
    expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    proof_id TEXT,
    proof_expires_at INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Complaints Table
CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    passenger_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    bus_number TEXT,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'resolved')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

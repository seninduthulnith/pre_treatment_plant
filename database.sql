-- 1. Users Table (for RBAC)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('admin', 'user')) NOT NULL
);

-- 2. Bath Definitions (Stores the "Rules" like Temp 65-70, SP 210)
CREATE TABLE bath_definitions (
    id SERIAL PRIMARY KEY,
    line_number INT NOT NULL, -- 1 or 2
    step_number INT NOT NULL, -- 1 to 12
    bath_name VARCHAR(100) NOT NULL,
    chemical_name VARCHAR(50),
    std_concentration VARCHAR(50),
    min_temp DECIMAL,
    max_temp DECIMAL,
    min_ph DECIMAL,
    max_ph DECIMAL,
    min_pointage_fa DECIMAL, -- Free Acid
    max_pointage_fa DECIMAL,
    min_pointage_ta DECIMAL, -- Total Acid
    max_pointage_ta DECIMAL
);

-- 3. Daily Readings (The data users enter)
CREATE TABLE bath_readings (
    id SERIAL PRIMARY KEY,
    bath_def_id INT REFERENCES bath_definitions(id),
    user_id INT REFERENCES users(id),
    reading_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Parameters observed
    measured_temp DECIMAL,
    measured_ph DECIMAL,
    measured_fa DECIMAL,
    measured_ta DECIMAL,
    
    -- Status
    is_agitation_working BOOLEAN,
    remarks TEXT
);

-- 4. Chemical Additions (When users add SP 210, etc.)
CREATE TABLE chemical_logs (
    id SERIAL PRIMARY KEY,
    bath_def_id INT REFERENCES bath_definitions(id),
    user_id INT REFERENCES users(id),
    added_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    chemical_name VARCHAR(50),
    quantity_liters DECIMAL NOT NULL
);

-- 5. Insert Initial Data for Line 01 (We will duplicate for Line 02 later)
INSERT INTO bath_definitions (line_number, step_number, bath_name, chemical_name, min_temp, max_temp, min_ph, max_ph, min_pointage_fa, max_pointage_fa)
VALUES 
(1, 1, 'Degrease Bath 1', 'SP 210', 65, 70, NULL, NULL, NULL, NULL),
(1, 2, 'Degrease Bath 2', 'SP 210', 65, 70, NULL, NULL, 125, 135),
(1, 3, 'Water Rinse', 'Water', NULL, NULL, 7, 9, NULL, NULL),
(1, 4, 'Derust 1', 'SP 310', NULL, NULL, NULL, NULL, 20, 30),
(1, 5, 'Derust 2', 'SP 310', NULL, NULL, NULL, NULL, 20, 30),
(1, 6, 'Water Rinse', 'Water', NULL, NULL, 5, 7, NULL, NULL),
(1, 7, 'Water Rinse', 'Water', NULL, NULL, 5, 7, NULL, NULL),
(1, 8, 'Conditioner', 'SP TiAct', NULL, NULL, 7.5, 10, NULL, NULL),
(1, 9, 'Phosphate 1', 'SP 445', 45, 55, NULL, NULL, 2.5, 5), 
(1, 10, 'Phosphate 2', 'SP 445', 45, 55, NULL, NULL, 2.5, 5),
(1, 11, 'Water Rinse', 'Water', NULL, NULL, 5, 7, NULL, NULL),
(1, 12, 'Passivation', 'SP 510', 65, 70, 3.5, 4.5, NULL, NULL);
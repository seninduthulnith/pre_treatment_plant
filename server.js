// ====================================================
// server.js - FULL VERSION (Production Ready)
// ====================================================
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// --- MIDDLEWARE SETUP ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // Crucial for reading JSON from fetch() calls
app.use(express.static('public'));
app.set('view engine', 'ejs');

// --- SESSION CONFIGURATION ---
app.use(session({
    secret: 'shamini_secret_key',
    resave: false,
    saveUninitialized: true
}));

// --- GLOBAL USER MIDDLEWARE ---
// Ensures 'user' variable is available in ALL EJS files automatically
app.use(function(req, res, next) {
    res.locals.user = req.session.user || null;
    next();
});

// --- DATABASE CONNECTION ---
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'shamini_db', 
    password: '8041',       
    port: 5434,             
});

// --- AUTH MIDDLEWARE ---
function checkAuth(req, res, next) {
    if (req.session.user) { 
        next(); 
    } else { 
        res.redirect('/login'); 
    }
}

// ====================================================
// 1. LOGIN ROUTES
// ====================================================
app.get('/', (req, res) => { res.redirect('/login'); });

app.get('/login', (req, res) => { res.render('login'); });

app.post('/login', async (req, res) => {
    const { emp_no, password } = req.body; 

    try {
        const result = await pool.query('SELECT * FROM users WHERE emp_no = $1', [emp_no]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            // Check password (plain text check based on your snippet)
            const dbPass = user.password_hash ? user.password_hash.trim() : (user.password ? user.password.trim() : ''); 
            
            if (dbPass === password.trim()) { 
                req.session.user = { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role, 
                    emp_no: user.emp_no 
                };
                
                // Redirect based on Role
                if(user.role === 'maintenance' || user.role === 'manager') {
                     res.redirect('/breakdown/manage'); 
                } else {
                     res.redirect('/dashboard'); 
                }
            } else { 
                res.send(`Invalid password. <a href='/login'>Try Again</a>`); 
            }
        } else { 
            res.send('Employee Number not found. <a href="/login">Try Again</a>'); 
        }
    } catch (err) { 
        console.error(err); 
        res.send("Login Error"); 
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => { res.redirect('/login'); });
});

// ====================================================
// 2. DASHBOARD (View Bath Data)
// ====================================================
app.get('/dashboard', checkAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bath_definitions ORDER BY line_number, id');
        res.render('dashboard', { items: result.rows, user: req.session.user });
    } catch (err) { 
        console.error(err); 
        res.send("Dashboard Error"); 
    }
});

// ====================================================
// 3. BATH LOGGING
// ====================================================
app.post('/save-bath-log', checkAuth, async (req, res) => {
    const { 
        bath_id, temp, ph, concentration, ta_pointage,
        fa_pointage, oil_content, iron_content, starch_colour, notes 
    } = req.body;

    const userRole = req.session.user.role;
    const allowedRoles = ['chemical', 'qc', 'qa', 'tester', 'operator']; 

    if (!allowedRoles.includes(userRole)) {
        return res.redirect('/dashboard'); 
    }

    try {
        await pool.query(
            `INSERT INTO bath_logs (
                bath_def_id, temp_logged, ph_logged, fralka_pointage_logged, oil_content_logged,
                ta_pointage_logged, fa_pointage_logged, iron_content_logged, starch_colour_logged, 
                notes, user_id, log_time
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [
                bath_id, temp || null, ph || null, concentration || null, oil_content || null,
                ta_pointage || null, fa_pointage || null, iron_content || null, starch_colour || null,
                notes, req.session.user.id
            ]
        );

        // Redirect back to the specific line
        const bathInfo = await pool.query('SELECT line_number FROM bath_definitions WHERE id = $1', [bath_id]);
        let redirectAnchor = '';
        if (bathInfo.rows.length > 0) {
            redirectAnchor = `#line-${bathInfo.rows[0].line_number}`;
        }

        res.redirect('/dashboard' + redirectAnchor); 

    } catch (err) {
        console.error("Database Error:", err);
        res.send(`Error saving data: ${err.message}`);
    }
});

// ====================================================
// 4. CHEMICAL LOGGING
// ====================================================
app.post('/save-chemical-log', checkAuth, async (req, res) => {
    const { bath_id, amount_added, chemical_name, sp_accelerator, sp_starter } = req.body;
    const userId = req.session.user.id;
    
    try {
        if (amount_added && amount_added > 0) {
            await pool.query(
                `INSERT INTO chemical_logs (bath_def_id, chemical_name, amount_added, user_id, log_time)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [bath_id, chemical_name, amount_added, userId]
            );
        }

        if (sp_accelerator && sp_accelerator > 0) {
            await pool.query(
                `INSERT INTO chemical_logs (bath_def_id, chemical_name, amount_added, user_id, log_time)
                 VALUES ($1, 'SP-Accelerator', $2, $3, NOW())`,
                [bath_id, sp_accelerator, userId]
            );
        }

        if (sp_starter && sp_starter > 0) {
            await pool.query(
                `INSERT INTO chemical_logs (bath_def_id, chemical_name, amount_added, user_id, log_time)
                 VALUES ($1, 'SP-Starter', $2, $3, NOW())`,
                [bath_id, sp_starter, userId]
            );
        }

        const bathInfo = await pool.query('SELECT line_number FROM bath_definitions WHERE id = $1', [bath_id]);
        let redirectAnchor = '';
        if (bathInfo.rows.length > 0) {
            redirectAnchor = `#line-${bathInfo.rows[0].line_number}`;
        }
        res.redirect('/dashboard' + redirectAnchor);

    } catch (err) {
        console.error("Database Error:", err);
        res.send(`Error saving chemical: ${err.message}`);
    }
});

// ====================================================
// 5. BREAKDOWN / JOB TICKET SYSTEM
// ====================================================
app.get('/breakdown/manage', checkAuth, async (req, res) => {
    try {
        const userRole = req.session.user.role;
        const baths = await pool.query('SELECT * FROM bath_definitions ORDER BY line_number, id');

        let query = `
            SELECT b.*, u.username as reporter, bath_definitions.bath_name 
            FROM breakdown_logs b
            LEFT JOIN users u ON b.reported_by_user_id = u.id
            LEFT JOIN bath_definitions ON b.bath_def_id = bath_definitions.id
        `;
        
        if (userRole === 'maintenance') {
            query += ` WHERE category = 'Maintenance'`;
        } else if (userRole === 'chemical' || userRole === 'qc') {
            query += ` WHERE category = 'Quality'`;
        } 

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query);
        
        res.render('breakdown_hub', { 
            user: req.session.user,
            breakdowns: result.rows,
            allBaths: baths.rows 
        });
    } catch (err) {
        console.error(err);
        res.send("Error loading job tickets.");
    }
});

app.post('/breakdown/report', checkAuth, async (req, res) => {
    const { line_number, bath_id, category, description } = req.body;
    const cleanBathId = bath_id === "" ? null : bath_id;

    try {
        await pool.query(
            `INSERT INTO breakdown_logs (line_number, bath_def_id, category, description, status, reported_by_user_id, created_at)
             VALUES ($1, $2, $3, $4, 'Pending', $5, NOW())`,
            [line_number, cleanBathId, category, description, req.session.user.id]
        );
        res.redirect('/breakdown/manage');
    } catch (err) {
        console.error(err);
        res.send("Error reporting issue.");
    }
});

app.post('/breakdown/start', checkAuth, async (req, res) => {
    const { breakdown_id } = req.body;
    const role = req.session.user.role;
    const allowedRoles = ['maintenance', 'chemical', 'qc', 'qa', 'tester'];

    if (!allowedRoles.includes(role)) return res.redirect('/breakdown/manage');

    try {
        await pool.query(
            `UPDATE breakdown_logs SET status = 'In Progress', repair_start_time = NOW() WHERE id = $1`,
            [breakdown_id]
        );
        res.redirect('/breakdown/manage');
    } catch (err) {
        console.error(err);
        res.send("Error starting repair.");
    }
});

app.post('/breakdown/end', checkAuth, async (req, res) => {
    const { breakdown_id, solution } = req.body;
    const role = req.session.user.role;
    const allowedRoles = ['maintenance', 'chemical', 'qc', 'qa', 'tester'];

    if (!allowedRoles.includes(role)) return res.redirect('/breakdown/manage');

    try {
        await pool.query(
            `UPDATE breakdown_logs 
             SET status = 'Completed', repair_end_time = NOW(), solution_notes = $1, resolved_by_user_id = $2
             WHERE id = $3`,
            [solution, req.session.user.id, breakdown_id]
        );
        res.redirect('/breakdown/manage');
    } catch (err) {
        console.error(err);
        res.send("Error finishing repair.");
    }
});

// ====================================================
// 6. ANALYTICS (GRAPHS & CHARTS)
// ====================================================

// A. RENDER THE PAGE
app.get('/analytics/spc', checkAuth, async (req, res) => {
    // Role Check
    if (!['qa', 'manager', 'qc', 'chemical'].includes(req.session.user.role)) {
        return res.redirect('/dashboard');
    }

    try {
        // 1. Get Baths list for dropdowns
        const baths = await pool.query('SELECT id, bath_name, line_number FROM bath_definitions ORDER BY line_number, id');
        
        // 2. Data for CHART: Chemical Usage (Unique Names for Dropdown)
        const chemQuery = `SELECT DISTINCT chemical_name FROM chemical_logs ORDER BY chemical_name ASC`;
        const chemData = await pool.query(chemQuery);

        // 3. Data for CHART: Breakdown
        const breakdownQuery = `
            SELECT category, COUNT(*) as issue_count
            FROM breakdown_logs
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY category
        `;
        const breakdownData = await pool.query(breakdownQuery);

        // Render 'analytics.ejs'
        res.render('analytics', { 
            user: req.session.user,
            baths: baths.rows,
            chemData: chemData.rows, 
            breakdownData: breakdownData.rows 
        });

    } catch (err) {
        console.error("Analytics Load Error:", err);
        res.send("Analytics Error: " + err.message);
    }
});

// B. API: FETCH GRAPH DATA (Called by frontend fetch())
app.post('/analytics/get-data', checkAuth, async (req, res) => {
    const { bath_id, parameter, start_date, end_date } = req.body;

    // Map frontend 'short names' to Database Columns
    const paramMap = {
        'temp': 'temp_logged',
        'ph': 'ph_logged',
        'ta': 'ta_pointage_logged',
        'fa': 'fa_pointage_logged',
        'fralka': 'fralka_pointage_logged',
        'iron': 'iron_content_logged',
        'oil': 'oil_content_logged',
        'starch': 'starch_colour_logged'
    };

    const dbColumn = paramMap[parameter];
    if (!dbColumn) return res.json({ error: "Invalid Parameter" });

    try {
        // Safe CAST to NUMERIC to ensure graphs work even if DB has text
        const query = `
            SELECT log_time, CAST(NULLIF(${dbColumn}, '') AS NUMERIC) as value, notes
            FROM bath_logs 
            WHERE bath_def_id = $1 
              AND log_time BETWEEN $2 AND $3
              AND ${dbColumn} IS NOT NULL
            ORDER BY log_time ASC
        `;
        
        // Append time to dates to capture the full day
        const start = start_date + ' 00:00:00';
        const end = end_date + ' 23:59:59';

        const result = await pool.query(query, [bath_id, start, end]);
        
        // Send data back as JSON
        res.json({ data: result.rows });

    } catch (err) {
        console.error(err);
        res.json({ error: "Database Error: " + err.message });
    }
});

// C. API: FETCH CHEMICAL STATS & LOGS (UPDATED)
app.post('/analytics/chemical-stats', checkAuth, async (req, res) => {
    const { chemical_name, start_date, end_date, line_number, bath_id } = req.body;

    try {
        // 1. Base Query Conditions
        // We join bath_definitions (alias b) immediately to filter by line/bath
        let baseQuery = `
            FROM chemical_logs c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN bath_definitions b ON c.bath_def_id = b.id
            WHERE c.log_time BETWEEN $1 AND $2
        `;
        
        let params = [start_date + ' 00:00:00', end_date + ' 23:59:59'];
        let paramIndex = 3;

        // 2. Dynamic Filters
        if (chemical_name && chemical_name !== 'all') {
            baseQuery += ` AND c.chemical_name = $${paramIndex}`;
            params.push(chemical_name);
            paramIndex++;
        }

        if (line_number && line_number !== 'all') {
            baseQuery += ` AND b.line_number = $${paramIndex}`;
            params.push(line_number);
            paramIndex++;
        }

        if (bath_id && bath_id !== 'all') {
            baseQuery += ` AND c.bath_def_id = $${paramIndex}`;
            params.push(bath_id);
            paramIndex++;
        }

        // 3. Fetch Detailed Table Data
        const listQuery = `
            SELECT c.log_time, c.chemical_name, c.amount_added, u.username, b.bath_name, b.line_number
            ${baseQuery}
            ORDER BY c.log_time DESC
        `;
        const listResult = await pool.query(listQuery, params);

        // 4. Fetch Aggregated Daily Data (ALWAYS group by day and chemical_name for correct clustering)
        const graphQuery = `
            SELECT DATE(c.log_time) as day, c.chemical_name, SUM(c.amount_added) as daily_total
            ${baseQuery}
            GROUP BY DATE(c.log_time), c.chemical_name
            ORDER BY day ASC, c.chemical_name ASC
        `;
        const graphResult = await pool.query(graphQuery, params);

        // 5. Calculate Stats (sum all values for selected chemical or all)
        let values;
        if (chemical_name && chemical_name !== 'all') {
            values = graphResult.rows.map(r => parseFloat(r.daily_total));
        } else {
            // For 'all', sum all chemicals per day
            const dayMap = {};
            graphResult.rows.forEach(r => {
                if (!dayMap[r.day]) dayMap[r.day] = 0;
                dayMap[r.day] += parseFloat(r.daily_total);
            });
            values = Object.values(dayMap);
        }
        const total = values.reduce((a, b) => a + b, 0);
        const n = values.length;
        const mean = n > 0 ? (total / n) : 0;
        const variance = n > 0 ? values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n : 0;
        const stdDev = Math.sqrt(variance);
        const frequency = {};
        let maxFreq = 0; let mode = 0;
        values.forEach(v => {
            frequency[v] = (frequency[v] || 0) + 1;
            if(frequency[v] > maxFreq) { maxFreq = frequency[v]; mode = v; }
        });
        if(n === 0) mode = 0;

        res.json({
            tableData: listResult.rows,
            graphData: graphResult.rows,
            stats: {
                total: total.toFixed(2),
                mean: mean.toFixed(2),
                stdDev: stdDev.toFixed(2),
                mode: mode.toFixed(2)
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ====================================================
// D. API: CHEMICAL OVERVIEW (SECTION 1)
// ====================================================
app.post('/analytics/chem-overview', checkAuth, async (req, res) => {
    const { start_date, end_date, line_number } = req.body;

    try {
        let params = [start_date + ' 00:00:00', end_date + ' 23:59:59'];
        let query = `
            SELECT c.chemical_name, DATE(c.log_time) as day, SUM(c.amount_added) as daily_sum
            FROM chemical_logs c
            LEFT JOIN bath_definitions b ON c.bath_def_id = b.id
            WHERE c.log_time BETWEEN $1 AND $2
        `;

        if (line_number && line_number !== 'all') {
            query += ` AND b.line_number = $3`;
            params.push(line_number);
        }

        query += ` GROUP BY c.chemical_name, day ORDER BY c.chemical_name`;

        const result = await pool.query(query, params);
        
        // Process data in Node to calculate Stats per Chemical
        const chemStats = {};

        result.rows.forEach(row => {
            const name = row.chemical_name;
            const val = parseFloat(row.daily_sum);

            if (!chemStats[name]) {
                chemStats[name] = { values: [], total: 0 };
            }
            chemStats[name].values.push(val);
            chemStats[name].total += val;
        });

        const summaryData = Object.keys(chemStats).map(name => {
            const vals = chemStats[name].values;
            const total = chemStats[name].total;
            const n = vals.length; // Number of days with additions
            
            // Daily Mean (Total / Days with entry)
            // Note: If you want Average over selected date range, divide Total by (end_date - start_date)
            // Here we do Average per "Active Day"
            const mean = n > 0 ? (total / n) : 0;

            // Mode Calculation
            const frequency = {};
            let maxFreq = 0;
            let mode = 0;
            vals.forEach(v => {
                frequency[v] = (frequency[v] || 0) + 1;
                if (frequency[v] > maxFreq) { maxFreq = frequency[v]; mode = v; }
            });

            return {
                chemical: name,
                total: total.toFixed(2),
                mean: mean.toFixed(2),
                mode: mode.toFixed(2)
            };
        });

        res.json(summaryData);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ====================================================
// ADD THIS TO THE BOTTOM OF SERVER.JS
// ====================================================

// 4. API: Monthly Trend (Stacked Bar Data)
app.post('/analytics/monthly-trend', checkAuth, async (req, res) => {
    const { start_date, end_date, line_number } = req.body;
    try {
        let params = [start_date + ' 00:00:00', end_date + ' 23:59:59'];
        let query = `
            SELECT 
                to_char(c.log_time, 'YYYY-MM') as month_key,
                to_char(c.log_time, 'Mon YYYY') as display_date,
                c.chemical_name, 
                SUM(c.amount_added) as monthly_total
            FROM chemical_logs c
            LEFT JOIN bath_definitions b ON c.bath_def_id = b.id
            WHERE c.log_time BETWEEN $1 AND $2
        `;

        if (line_number && line_number !== 'all') {
            query += ` AND b.line_number = $3`;
            params.push(line_number);
        }

        query += ` GROUP BY month_key, display_date, c.chemical_name ORDER BY month_key ASC`;
        const result = await pool.query(query, params);
        const rawRows = result.rows;

        // Get all unique months and chemicals
        const months = Array.from(new Set(rawRows.map(r => r.month_key)))
            .sort();
        const chemicals = Array.from(new Set(rawRows.map(r => r.chemical_name)))
            .sort();

        // Map: { month_key: { display_date, chemical1: val, chemical2: val, ... } }
        const monthMap = {};
        months.forEach(month => {
            const display_date = rawRows.find(r => r.month_key === month)?.display_date || month;
            monthMap[month] = { month_key: month, display_date };
            chemicals.forEach(chem => {
                monthMap[month][chem] = 0;
            });
        });

        // Fill values
        rawRows.forEach(row => {
            if (monthMap[row.month_key]) {
                monthMap[row.month_key][row.chemical_name] = parseFloat(row.monthly_total);
            }
        });

        // Output as array
        const pivoted = months.map(month => monthMap[month]);
        res.json({
            months: pivoted,
            chemicals
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// --- SERVER LISTEN ---
app.listen(PORT, () => { 
    console.log(`🚀 Server running on port ${PORT}`); 
});
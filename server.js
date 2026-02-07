// ====================================================
// server.js - UPDATED for Analytics Dashboard
// ====================================================
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bodyParser = require('body-parser');

const app = express();

// --- MIDDLEWARE SETUP ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(session({
    secret: 'shamini_secret_key',
    resave: false,
    saveUninitialized: true
}));

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
    // 1. Capture ALL data from form
    const { 
        bath_id, 
        temp, 
        ph, 
        concentration, 
        ta_pointage,
        fa_pointage,
        oil_content,
        iron_content,
        starch_colour, 
        notes 
    } = req.body;

    const userRole = req.session.user.role;
    const allowedRoles = ['chemical', 'qc', 'qa', 'tester', 'operator']; 

    if (!allowedRoles.includes(userRole)) {
        return res.redirect('/dashboard'); 
    }

    try {
        // 2. Insert into DB
        await pool.query(
            `INSERT INTO bath_logs (
                bath_def_id, 
                temp_logged, 
                ph_logged, 
                fralka_pointage_logged, 
                oil_content_logged,
                ta_pointage_logged,
                fa_pointage_logged,
                iron_content_logged,
                starch_colour_logged, 
                notes, 
                user_id, 
                log_time
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [
                bath_id,                    
                temp || null,               
                ph || null,                 
                concentration || null,      
                oil_content || null,        
                ta_pointage || null,        
                fa_pointage || null,        
                iron_content || null,       
                starch_colour || null,      
                notes,                      
                req.session.user.id         
            ]
        );

        // 3. Auto-Scroll to Line
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
    // We capture main chem data AND the optional phosphate extras
    const { bath_id, amount_added, chemical_name, sp_accelerator, sp_starter } = req.body;
    const userId = req.session.user.id;
    
    try {
        // 1. Save the MAIN Chemical (if amount provided)
        if (amount_added && amount_added > 0) {
            await pool.query(
                `INSERT INTO chemical_logs (bath_def_id, chemical_name, amount_added, user_id, log_time)
                 VALUES ($1, $2, $3, $4, NOW())`,
                [bath_id, chemical_name, amount_added, userId]
            );
        }

        // 2. Save SP-Accelerator (Only if user typed a number)
        if (sp_accelerator && sp_accelerator > 0) {
            await pool.query(
                `INSERT INTO chemical_logs (bath_def_id, chemical_name, amount_added, user_id, log_time)
                 VALUES ($1, 'SP-Accelerator', $2, $3, NOW())`,
                [bath_id, sp_accelerator, userId]
            );
        }

        // 3. Save SP-Starter (Only if user typed a number)
        if (sp_starter && sp_starter > 0) {
            await pool.query(
                `INSERT INTO chemical_logs (bath_def_id, chemical_name, amount_added, user_id, log_time)
                 VALUES ($1, 'SP-Starter', $2, $3, NOW())`,
                [bath_id, sp_starter, userId]
            );
        }

        // Auto-Scroll Logic
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

// VIEW: Breakdown Hub
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

// ACTION: Report Issue
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

// ACTION: Start Repair
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

// ACTION: Finish Repair
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
// 6. ANALYTICS (UPDATED for 3-Button Dashboard)
// ====================================================

// VIEW: Analytics Dashboard
// Fetches initial data for all 3 charts: Trends, Chemical Usage, and Breakdowns
app.get('/analytics/spc', checkAuth, async (req, res) => {
    // Role Check
    if (!['qa', 'manager'].includes(req.session.user.role)) {
        return res.redirect('/dashboard');
    }

    try {
        // 1. Get Baths list for dropdowns
        const baths = await pool.query('SELECT id, bath_name, line_number FROM bath_definitions ORDER BY line_number, id');
        
        // 2. Data for CHART 1: Parameter Analysis (Last 7 Days Average Temp/pH)
        // This gives a nice default "Trend" to show when page opens
        const trendQuery = `
            SELECT TO_CHAR(log_time, 'Mon DD') as date_label, 
                   AVG(CAST(NULLIF(temp_logged, '') AS NUMERIC)) as avg_temp, 
                   AVG(CAST(NULLIF(ph_logged, '') AS NUMERIC)) as avg_ph 
            FROM bath_logs 
            WHERE log_time > NOW() - INTERVAL '7 days' 
            GROUP BY TO_CHAR(log_time, 'Mon DD'), DATE(log_time)
            ORDER BY DATE(log_time) ASC
        `;
        const trendData = await pool.query(trendQuery);

        // 3. Data for CHART 2: Chemical Usage (Total Sum by Chemical Name)
        const chemQuery = `
            SELECT chemical_name, SUM(amount_added) as total_liters
            FROM chemical_logs
            WHERE log_time > NOW() - INTERVAL '30 days'
            GROUP BY chemical_name
            ORDER BY total_liters DESC
        `;
        const chemData = await pool.query(chemQuery);

        // 4. Data for CHART 3: Breakdown (Count by Category)
        const breakdownQuery = `
            SELECT category, COUNT(*) as issue_count
            FROM breakdown_logs
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY category
        `;
        const breakdownData = await pool.query(breakdownQuery);

        // Render the EJS passing all these datasets
        res.render('analytics_1', { 
            user: req.session.user,
            baths: baths.rows,
            trendData: trendData.rows,      // Passed to Frontend
            chemData: chemData.rows,        // Passed to Frontend
            breakdownData: breakdownData.rows // Passed to Frontend
        });

    } catch (err) {
        console.error("Analytics Load Error:", err);
        res.send("Analytics Error: " + err.message);
    }
});

// API: Fetch Specific Parameter Data (For custom filtering)
app.post('/analytics/get-data', checkAuth, async (req, res) => {
    const { bath_id, parameter, start_date, end_date } = req.body;

    // --- UPDATED MAPPING BASED ON YOUR REQUEST ---
    const paramMap = {
        'temp': 'temp_logged',                 // Temperature
        'ph': 'ph_logged',                     // pH Level
        'ta': 'ta_pointage_logged',            // TA (Total Acid)
        'fa': 'fa_pointage_logged',            // FA (Free Acid)
        'fralka': 'fralka_pointage_logged',    // Free Alkali Pointage
        'iron': 'iron_content_logged',         // Iron Content
        'oil': 'oil_content_logged',           // Oil Content
        'starch': 'starch_colour_logged'       // Starch Colour (NEW)
    };

    const dbColumn = paramMap[parameter];
    if (!dbColumn) return res.json({ error: "Invalid Parameter" });

    try {
        const query = `
            SELECT log_time, CAST(NULLIF(${dbColumn}, '') AS NUMERIC) as value, notes
            FROM bath_logs 
            WHERE bath_def_id = $1 
              AND log_time BETWEEN $2 AND $3
              AND ${dbColumn} IS NOT NULL
            ORDER BY log_time ASC
        `;
        
        // Ensure dates include full day range
        const start = start_date + ' 00:00:00';
        const end = end_date + ' 23:59:59';

        const result = await pool.query(query, [bath_id, start, end]);
        
        res.json({ data: result.rows });
    } catch (err) {
        console.error(err);
        res.json({ error: "Database Error: " + err.message });
    }
});

// ====================================================
// START SERVER
// ====================================================
app.listen(3000, () => { 
    console.log("🚀 Server running on port 3000"); 
});
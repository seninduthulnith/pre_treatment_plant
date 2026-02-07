const { Pool } = require('pg');

// Replace 'your_password' with the password you set for Postgres
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'shamini_db',
    password: '8041', // <--- IMPORTANT: Update this!
    port: 5434,
});

pool.on('connect', () => {
  console.log('Connected to the Shamini Database successfully!');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
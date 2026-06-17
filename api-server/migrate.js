// Database migration script
import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  console.log('🗄️  Starting database migration...\n');
  
  try {
    // Test connection first
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Database connection verified:', testResult.rows[0].now);
    
    // Read schema file
    const schema = fs.readFileSync('./schema.sql', 'utf8');
    
    // Execute schema
    await pool.query(schema);
    
    console.log('✅ Schema created successfully!');
    
    // Check tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\n📋 Tables created:');
    tables.rows.forEach(row => {
      console.log('  -', row.table_name);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n✅ Migration complete!');
  }
}

migrate();

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const isCloudDb = process.env.DATABASE_URL.includes('supabase.co') || 
                   process.env.DATABASE_URL.includes('supabase.com') || 
                   process.env.DATABASE_URL.includes('neon.tech');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDb ? { rejectUnauthorized: false } : false
});

// For general queries (e.g. creating/checking organizations)
export const query = (text, params) => pool.query(text, params);

/**
 * Executes database operations within a tenant-isolated transaction block.
 * Sets the 'app.current_organization_id' session variable so PostgreSQL
 * Row-Level Security (RLS) policies are automatically enforced.
 * 
 * @param {string} orgId - The UUID of the organization (tenant).
 * @param {function} callback - Async function executing queries on the client.
 * @returns {Promise<any>} The result returned by the callback.
 */
export const executeInTenantContext = async (orgId, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_organization_id', $1, true)", [orgId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Executes database operations bypassing Row-Level Security.
 * This is only allowed for superusers (e.g., during login when organization_id is not yet known).
 * 
 * @param {function} callback - Async function executing queries on the client.
 * @returns {Promise<any>} The result returned by the callback.
 */
export const executeBypassingRLS = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL row_security = off');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default pool;

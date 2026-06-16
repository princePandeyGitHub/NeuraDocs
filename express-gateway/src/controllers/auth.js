import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, executeInTenantContext, executeBypassingRLS } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'neuradocs_secret_key_123456';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Register a new organization and admin user.
 */
export const register = async (req, res, next) => {
  const { orgName, email, password, firstName, lastName } = req.body;

  if (!orgName || !email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // 1. Create Organization (not RLS protected)
    const orgResult = await query(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
      [orgName]
    );
    const org = orgResult.rows[0];

    // 2. Hash Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Create Admin User (within the tenant context of the new org)
    const user = await executeInTenantContext(org.id, async (client) => {
      // Check if email already exists
      const checkUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (checkUser.rows.length > 0) {
        const err = new Error('Email already registered');
        err.statusCode = 400;
        throw err;
      }

      const userResult = await client.query(
        `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, first_name, last_name, role`,
        [org.id, email, passwordHash, firstName, lastName, 'ADMIN']
      );
      return userResult.rows[0];
    });

    res.status(201).json({
      message: 'Organization and administrator registered successfully',
      organization: org,
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Authenticate a user and return a JWT.
 */
export const login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Fetch user details bypassing RLS to find the organization_id
    const user = await executeBypassingRLS(async (client) => {
      const userResult = await client.query(
        'SELECT id, organization_id, email, password_hash, first_name, last_name, role FROM users WHERE email = $1',
        [email]
      );
      return userResult.rows[0];
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        sub: user.id,
        org_id: user.organization_id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user.id,
        org_id: user.organization_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (err) {
    next(err);
  }
};

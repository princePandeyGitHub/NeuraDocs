import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'neuradocs_secret_key_123456';

/**
 * Middleware to authenticate requests using JWT tokens.
 * Extracts the user payload and organization context, attaching them to req.user.
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    
    // Attach user properties: id, org_id, email, role
    req.user = {
      id: decoded.sub || decoded.id,
      org_id: decoded.org_id,
      email: decoded.email,
      role: decoded.role
    };
    next();
  });
};

/**
 * Middleware to restrict access to specific user roles (e.g. ADMIN).
 * @param {string[]} roles - Allowed roles
 */
export const requireRoles = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User is not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

export const requireAdmin = requireRoles(['ADMIN']);

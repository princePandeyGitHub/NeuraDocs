import express from 'express';
import { createSession, getSessions, getMessages, sendQuery } from '../controllers/chat.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/sessions', authenticateToken, createSession);
router.get('/sessions', authenticateToken, getSessions);
router.get('/sessions/:id/messages', authenticateToken, getMessages);
router.post('/sessions/:id/query', authenticateToken, sendQuery);

export default router;

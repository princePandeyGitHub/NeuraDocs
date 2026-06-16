import express from 'express';
import multer from 'multer';
import { getDocuments, uploadDocument, deleteDocument } from '../controllers/documents.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Configure multer to store files in memory for forwarding to FastAPI
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Limit to 20MB
  },
});

router.get('/', authenticateToken, getDocuments);
router.post('/upload', authenticateToken, requireAdmin, upload.single('file'), uploadDocument);
router.delete('/:id', authenticateToken, requireAdmin, deleteDocument);

export default router;

import fs from 'fs';
import path from 'path';
import { executeInTenantContext } from '../config/db.js';

const FASTAPI_SERVICE_URL = process.env.FASTAPI_SERVICE_URL || 'http://localhost:8000';

/**
 * Get all documents for the authenticated user's organization.
 */
export const getDocuments = async (req, res, next) => {
  const { org_id } = req.user;

  try {
    const docs = await executeInTenantContext(org_id, async (client) => {
      const result = await client.query(
        'SELECT id, filename, file_type, file_size, status, uploaded_at FROM documents ORDER BY uploaded_at DESC'
      );
      return result.rows;
    });

    res.json(docs);
  } catch (err) {
    next(err);
  }
};

/**
 * Upload a document and trigger ingestion.
 */
export const uploadDocument = async (req, res, next) => {
  const { org_id } = req.user;

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { originalname, size, buffer, mimetype } = req.file;

  // Determine file type from extension
  const ext = path.extname(originalname).toLowerCase();
  let fileType = '';
  if (ext === '.pdf') fileType = 'PDF';
  else if (ext === '.docx') fileType = 'DOCX';
  else if (ext === '.json') fileType = 'JSON';
  else {
    return res.status(400).json({ error: 'Unsupported file type. Only PDF, DOCX, and JSON are allowed.' });
  }

  try {
    // 1. Insert pending document record in DB
    const doc = await executeInTenantContext(org_id, async (client) => {
      const result = await client.query(
        `INSERT INTO documents (organization_id, filename, file_type, file_path, file_size, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')
         RETURNING id, filename, file_type, file_size, status, uploaded_at`,
        [org_id, originalname, fileType, `temp://${originalname}`, size]
      );
      return result.rows[0];
    });

    // 2. Dispatch file ingestion asynchronously to FastAPI
    // We construct a FormData object and append the file buffer
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimetype });
    formData.append('file', blob, originalname);
    formData.append('document_id', doc.id);
    formData.append('org_id', org_id);

    // Run this asynchronously; do not block the client response
    fetch(`${FASTAPI_SERVICE_URL}/ingest/upload`, {
      method: 'POST',
      body: formData,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errMsg = await response.text();
          throw new Error(errMsg || 'FastAPI ingestion error');
        }
        console.log(`Ingestion started successfully for document: ${doc.id}`);
      })
      .catch(async (fetchErr) => {
        console.error(`Error forwarding upload to FastAPI for doc ${doc.id}:`, fetchErr);
        // Mark document status as FAILED in database
        try {
          await executeInTenantContext(org_id, async (client) => {
            await client.query(
              'UPDATE documents SET status = $1 WHERE id = $2',
              ['FAILED', doc.id]
            );
          });
        } catch (dbErr) {
          console.error('Failed to update document status to FAILED:', dbErr);
        }
      });

    // 3. Respond immediately with the pending document details
    res.status(202).json({
      message: 'Document uploaded. Ingestion processing in the background.',
      document: doc
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete a document and its vectors.
 */
export const deleteDocument = async (req, res, next) => {
  const { org_id } = req.user;
  const { id } = req.params;

  try {
    const deletedDoc = await executeInTenantContext(org_id, async (client) => {
      const result = await client.query(
        'DELETE FROM documents WHERE id = $1 RETURNING id, filename',
        [id]
      );
      return result.rows[0];
    });

    if (!deletedDoc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      message: 'Document and its vector segments deleted successfully',
      document: deletedDoc
    });
  } catch (err) {
    next(err);
  }
};

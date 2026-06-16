import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`[Express Gateway] Server is running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Express Gateway] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[Express Gateway] Server closed.');
  });
});

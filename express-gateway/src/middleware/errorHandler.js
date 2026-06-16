/**
 * Global error handling middleware.
 * Catches unhandled errors and sends a consistent JSON response.
 */
export const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]:', err.message, err.stack);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    // Avoid sending stack traces to client in production
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

export default errorHandler;

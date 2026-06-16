import { executeInTenantContext } from '../config/db.js';

const FASTAPI_SERVICE_URL = process.env.FASTAPI_SERVICE_URL || 'http://localhost:8000';

/**
 * Create a new chat session.
 */
export const createSession = async (req, res, next) => {
  const { org_id, id: user_id } = req.user;
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const session = await executeInTenantContext(org_id, async (client) => {
      const result = await client.query(
        `INSERT INTO chat_sessions (organization_id, user_id, title)
         VALUES ($1, $2, $3)
         RETURNING id, title, created_at, updated_at`,
        [org_id, user_id, title]
      );
      return result.rows[0];
    });

    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
};

/**
 * List all chat sessions for the logged-in user.
 */
export const getSessions = async (req, res, next) => {
  const { org_id, id: user_id } = req.user;

  try {
    const sessions = await executeInTenantContext(org_id, async (client) => {
      const result = await client.query(
        'SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
        [user_id]
      );
      return result.rows;
    });

    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

/**
 * Get all messages for a specific chat session.
 */
export const getMessages = async (req, res, next) => {
  const { org_id, id: user_id } = req.user;
  const { id: sessionId } = req.params;

  try {
    const messages = await executeInTenantContext(org_id, async (client) => {
      // First verify session ownership
      const sessionCheck = await client.query(
        'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, user_id]
      );

      if (sessionCheck.rows.length === 0) {
        const err = new Error('Chat session not found');
        err.statusCode = 404;
        throw err;
      }

      const result = await client.query(
        'SELECT id, sender, content, citations, created_at FROM chat_messages WHERE chat_session_id = $1 ORDER BY created_at ASC',
        [sessionId]
      );
      return result.rows;
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
};

/**
 * Post a query to a chat session, run RAG, and return the response.
 */
export const sendQuery = async (req, res, next) => {
  const { org_id, id: user_id } = req.user;
  const { id: sessionId } = req.params;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    // 1. Verify session ownership and retrieve chat history (limit to last 10 messages for context window)
    const context = await executeInTenantContext(org_id, async (client) => {
      const sessionCheck = await client.query(
        'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, user_id]
      );

      if (sessionCheck.rows.length === 0) {
        const err = new Error('Chat session not found');
        err.statusCode = 404;
        throw err;
      }

      // Insert user message in database
      const userMsgResult = await client.query(
        `INSERT INTO chat_messages (chat_session_id, sender, content)
         VALUES ($1, 'USER', $2)
         RETURNING id, sender, content, created_at`,
        [sessionId, message]
      );

      // Update session updated_at timestamp
      await client.query(
        'UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1',
        [sessionId]
      );

      // Fetch history for context
      const historyResult = await client.query(
        `SELECT sender, content FROM chat_messages 
         WHERE chat_session_id = $1 
         ORDER BY created_at DESC LIMIT 10`,
        [sessionId]
      );

      return {
        userMessage: userMsgResult.rows[0],
        history: historyResult.rows.reverse()
      };
    });

    // 2. Format history for FastAPI (map USER -> user, AI -> assistant)
    const formattedHistory = context.history.map(msg => ({
      role: msg.sender === 'USER' ? 'user' : 'assistant',
      content: msg.content
    }));

    // 3. Make RAG request to FastAPI
    const fastapiResponse = await fetch(`${FASTAPI_SERVICE_URL}/rag/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: message,
        org_id: org_id,
        history: formattedHistory
      })
    });

    if (!fastapiResponse.ok) {
      const errorText = await fastapiResponse.text();
      throw new Error(`RAG service error: ${errorText || fastapiResponse.statusText}`);
    }

    const { response: aiAnswer, citations } = await fastapiResponse.json();

    // 4. Save AI response and citations to DB
    const aiMessage = await executeInTenantContext(org_id, async (client) => {
      const result = await client.query(
        `INSERT INTO chat_messages (chat_session_id, sender, content, citations)
         VALUES ($1, 'AI', $2, $3)
         RETURNING id, sender, content, citations, created_at`,
        [sessionId, aiAnswer, JSON.stringify(citations || [])]
      );
      return result.rows[0];
    });

    // 5. Send results back to the user
    res.json({
      userMessage: context.userMessage,
      aiMessage: aiMessage
    });

  } catch (err) {
    next(err);
  }
};

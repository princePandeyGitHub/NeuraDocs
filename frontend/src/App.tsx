import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  MessageSquare,
  Plus,
  LogOut,
  UploadCloud,
  FileText,
  Trash2,
  User,
  Server,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Bot,
  Send,
  Lock,
  Building2,
  Sparkles,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000/api';

// Types
interface UserSession {
  id: string;
  org_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'MEMBER';
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Citation {
  filename: string;
  page_number: number;
}

interface Message {
  id: string;
  sender: 'USER' | 'AI';
  content: string;
  citations?: Citation[];
  created_at: string;
}

interface DocumentItem {
  id: string;
  filename: string;
  file_type: 'PDF' | 'DOCX' | 'JSON';
  file_size: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  uploaded_at: string;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export default function App() {
  // Authentication State
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<UserSession | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  );

  // Auth Forms State
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [orgName, setOrgName] = useState('');

  // Dashboard Navigation State
  const [currentView, setCurrentView] = useState<'chat' | 'documents'>('chat');

  // Chat State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isNewSessionModalOpen, setIsNewSessionModalOpen] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');

  // Documents State (Admin only)
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Global UI States
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Refs for UI
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const documentPollRef = useRef<number | null>(null);

  // Helper to trigger toast notifications
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Synchronize Auth Credentials
  const saveAuth = (newToken: string, newUser: UserSession) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    setDocuments([]);
    showToast('Logged out successfully', 'info');
  };

  // Auth requests
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isRegisterMode) {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgName,
            email: authEmail,
            password: authPassword,
            firstName,
            lastName
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Registration failed');
        showToast('Registration successful! Please login.', 'success');
        setIsRegisterMode(false);
      } else {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, password: authPassword })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Invalid credentials');
        saveAuth(data.token, data.user);
        showToast(`Welcome back, ${data.user.first_name}!`, 'success');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Chat Sessions
  const fetchSessions = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load chat history');
      const data = await response.json();
      setSessions(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Fetch Chat Messages
  const fetchMessages = async (sessionId: string) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load messages');
      const data = await response.json();
      setMessages(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Documents (Admin only)
  const fetchDocuments = async () => {
    if (!token || user?.role !== 'ADMIN') return;
    try {
      const response = await fetch(`${API_BASE_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();
      setDocuments(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Handle Chat message submit
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeSessionId || !token) return;

    const currentMsgText = chatInput;
    setChatInput('');

    // Pre-render local message for responsiveness
    const tempUserMsg: Message = {
      id: Math.random().toString(),
      sender: 'USER',
      content: currentMsgText,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    
    // Add artificial loading skeleton message for bot response
    const tempAiMsg: Message = {
      id: 'ai-loader',
      sender: 'AI',
      content: 'thinking',
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, tempAiMsg]);

    try {
      const response = await fetch(`${API_BASE_URL}/chat/sessions/${activeSessionId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: currentMsgText })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Server error during RAG synthesis');

      setMessages((prev) =>
        prev.filter((m) => m.id !== 'ai-loader').concat(data.aiMessage)
      );
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== 'ai-loader'));
      showToast(err.message, 'error');
    }
  };

  // Create new session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionTitle.trim() || !token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/chat/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: newSessionTitle })
      });
      const data = await response.json();
      if (!response.ok) throw new Error('Failed to create new session');

      setSessions((prev) => [data, ...prev]);
      setActiveSessionId(data.id);
      setMessages([]);
      setNewSessionTitle('');
      setIsNewSessionModalOpen(false);
      showToast('Chat session initialized');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Document management actions
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedFile || !token) return;
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');

      showToast(data.message || 'File uploaded, beginning ingestion', 'success');
      setSelectedFile(null);
      fetchDocuments();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this document and all its indexed vector embeddings?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete');

      showToast(data.message, 'success');
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Drag-and-drop mechanics
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['pdf', 'docx', 'json'].includes(ext || '')) {
        setSelectedFile(file);
      } else {
        showToast('Only PDF, DOCX, and JSON files are supported', 'error');
      }
    }
  };

  // Hooks & Effects
  useEffect(() => {
    // Clear corrupt or incomplete localStorage user profiles
    if (user && (!user.id || !user.email || !user.first_name)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  }, [user]);

  useEffect(() => {
    if (token) {
      fetchSessions();
      if (user?.role === 'ADMIN') {
        fetchDocuments();
      }
    }
  }, [token]);

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    }
  }, [activeSessionId]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling for processing documents status
  useEffect(() => {
    if (token && user?.role === 'ADMIN' && currentView === 'documents') {
      fetchDocuments(); // initial call
      documentPollRef.current = window.setInterval(() => {
        fetchDocuments();
      }, 5000);
    }
    return () => {
      if (documentPollRef.current) {
        clearInterval(documentPollRef.current);
      }
    };
  }, [token, currentView]);

  // Render Login / Register screen if unauthenticated or profile is corrupt
  if (!token || !user || !user.email) {
    return (
      <div className="auth-container">
        <div className="auth-card glass">
          <div className="auth-header">
            <div className="logo-text">NeuraDocs</div>
            <h1 className="auth-title">
              {isRegisterMode ? 'Create Organization' : 'Sign In'}
            </h1>
            <p className="auth-subtitle">
              {isRegisterMode
                ? 'Register your business tenant and start search indexing.'
                : 'Enter your organization credentials to begin.'}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit}>
            {isRegisterMode && (
              <>
                <div className="form-group">
                  <label className="form-label">Organization Name</label>
                  <div style={{ position: 'relative' }}>
                    <Building2
                      size={18}
                      className="form-input-icon"
                      style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Acme Corp"
                      style={{ paddingLeft: 38 }}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="form-group row">
                  <div>
                    <label className="form-label">First Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label">Last Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Work Email</label>
              <div style={{ position: 'relative' }}>
                <User
                  size={18}
                  style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
                />
                <input
                  type="email"
                  className="form-input"
                  placeholder="name@company.com"
                  style={{ paddingLeft: 38 }}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}
                />
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  style={{ paddingLeft: 38 }}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={isLoading}>
              {isLoading ? (
                <div className="spinner" />
              ) : isRegisterMode ? (
                'Register & Launch'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="auth-footer">
            {isRegisterMode ? (
              <>
                Already have an organization?{' '}
                <button
                  type="button"
                  className="auth-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setIsRegisterMode(false)}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Need to create a tenant?{' '}
                <button
                  type="button"
                  className="auth-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setIsRegisterMode(true)}
                >
                  Create Organization
                </button>
              </>
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="notifications">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.type}`}>
              {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{toast.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render Authenticated Dashboard
  return (
    <div className="app-container">
      {/* Sidebar navigation */}
      <aside className="sidebar glass">
        <div className="sidebar-header">
          <div className="logo-text">NeuraDocs</div>
        </div>

        <button
          className="btn btn-primary sidebar-nav-btn"
          onClick={() => setIsNewSessionModalOpen(true)}
        >
          <Plus size={18} />
          New Chat
        </button>

        <div className="sessions-container">
          <div className="sessions-title">Chat History</div>
          {sessions.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No chats found.
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                className={`session-item ${activeSessionId === session.id && currentView === 'chat' ? 'active' : ''}`}
                onClick={() => {
                  setCurrentView('chat');
                  setActiveSessionId(session.id);
                }}
              >
                <MessageSquare size={16} />
                <span className="session-item-text">{session.title}</span>
              </button>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          {user.role === 'ADMIN' && (
            <button
              className={`btn btn-secondary ${currentView === 'documents' ? 'btn-primary' : ''}`}
              style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => setCurrentView('documents')}
            >
              <UploadCloud size={18} />
              Manage Documents
            </button>
          )}

          <div className="user-profile">
            <div className="user-avatar">
              {user?.first_name?.[0] || 'U'}
              {user?.last_name?.[0] || ''}
            </div>
            <div className="user-info">
              <div className="user-name">
                {user?.first_name || ''} {user?.last_name || ''}
              </div>
              <div className="user-org">{user?.role || 'MEMBER'}</div>
            </div>
            <button
              className="delete-action-btn"
              onClick={logout}
              title="Logout"
              style={{ padding: '8px', borderRadius: '8px' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div className="header-title">
            {currentView === 'chat'
              ? sessions.find((s) => s.id === activeSessionId)?.title || 'Secure AI Chat'
              : 'Ingestion Control Hub'}
          </div>
          <div className="header-actions">
            {currentView === 'chat' && activeSessionId && (
              <span className="status-badge completed">
                <Bot size={14} style={{ marginRight: 4 }} /> RAG Active
              </span>
            )}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Workspace: <strong>{user?.email?.split('@')?.[1] || 'Default'}</strong>
            </span>
          </div>
        </header>

        {/* View Switcher */}
        {currentView === 'chat' ? (
          /* CHAT VIEW */
          !activeSessionId ? (
            <div className="welcome-container">
              <div className="welcome-icon-wrapper">
                <Sparkles size={36} />
              </div>
              <h1 className="welcome-title">Enter the Knowledge Base</h1>
              <p className="welcome-desc">
                Welcome to your tenant-isolated document RAG chatbot. Initialize a chat session, select it, and query your proprietary files safely.
              </p>
              <div className="welcome-grid">
                <div className="welcome-card">
                  <div className="welcome-card-title">
                    <CheckCircle2 size={16} style={{ color: 'var(--success)' }} /> Row-Level Isolation
                  </div>
                  <div className="welcome-card-desc">
                    Your database queries run strictly inside a pgvector transaction isolated to your organization.
                  </div>
                </div>
                <div className="welcome-card">
                  <div className="welcome-card-title">
                    <Sparkles size={16} style={{ color: 'var(--accent-secondary)' }} /> Citations Engine
                  </div>
                  <div className="welcome-card-desc">
                    Every statement synthesized by the LLM links back to the source file name and page number.
                  </div>
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: '2.5rem', width: 'auto' }}
                onClick={() => setIsNewSessionModalOpen(true)}
              >
                Create First Session <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Messages Body */}
              <div className="chat-messages-wrapper">
                {messages.length === 0 && !isLoading && (
                  <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>
                    <MessageSquare size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                    <p>This session has no messages yet. Type your query below to consult your document context.</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`message-bubble ${msg.sender === 'USER' ? 'user' : 'ai'}`}>
                    <div className="message-avatar">
                      {msg.sender === 'USER' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className="message-content-box">
                      {msg.content === 'thinking' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                          <div className="spinner" /> Synthesizing context with Llama 3.1...
                        </div>
                      ) : (
                        <>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {msg.sender === 'AI' && msg.citations && msg.citations.length > 0 && (
                            <div className="citations-wrapper">
                              <span className="citation-title">Sources:</span>
                              {msg.citations.map((cite, cIdx) => (
                                <span key={cIdx} className="citation-badge">
                                  <FileText size={12} />
                                  {cite.filename} (Page {cite.page_number})
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Footer */}
              <div className="chat-input-container">
                <form onSubmit={handleSendMessage} className="chat-input-form">
                  <input
                    type="text"
                    className="chat-textarea"
                    placeholder="Ask a question about your organization documents..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isLoading || messages.some((m) => m.id === 'ai-loader')}
                  />
                  <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={!chatInput.trim() || isLoading || messages.some((m) => m.id === 'ai-loader')}
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </div>
          )
        ) : (
          /* DOCUMENTS VIEW (ADMIN ONLY) */
          <div className="documents-container">
            <h1 className="welcome-title" style={{ fontSize: '1.75rem', marginBottom: '2rem' }}>
              Document Library Management
            </h1>
            <div className="documents-grid">
              {/* Upload Panel */}
              <div className="upload-card glass">
                <h3 className="card-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>
                  Index New Resource
                </h3>
                <div
                  className={`dropzone ${dragActive ? 'active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <input
                    type="file"
                    id="file-input"
                    className="file-input"
                    accept=".pdf,.docx,.json"
                    onChange={handleFileChange}
                  />
                  <UploadCloud size={32} className="dropzone-icon" />
                  <div className="dropzone-title">Click or drag document</div>
                  <div className="dropzone-subtitle">Supports PDF, DOCX, and JSON (Max 20MB)</div>
                </div>

                {selectedFile && (
                  <div className="upload-file-details">
                    <FileText size={20} style={{ color: 'var(--accent-secondary)' }} />
                    <div className="upload-file-info">
                      <div className="upload-filename">{selectedFile.name}</div>
                      <div className="upload-filesize">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button
                      type="button"
                      className="delete-action-btn"
                      onClick={() => setSelectedFile(null)}
                      title="Clear Selection"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: '1.5rem', width: '100%' }}
                  disabled={!selectedFile || isUploading}
                  onClick={handleUploadDocument}
                >
                  {isUploading ? <div className="spinner" /> : 'Begin Chunk Ingestion'}
                </button>
              </div>

              {/* List Panel */}
              <div className="docs-list-card glass">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 className="card-title" style={{ margin: 0, fontSize: '1rem' }}>
                    Uploaded Documents
                  </h3>
                  <button
                    className="delete-action-btn"
                    onClick={fetchDocuments}
                    title="Refresh List"
                    style={{ padding: '6px', borderRadius: '6px' }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>

                <div className="table-wrapper">
                  {documents.length === 0 ? (
                    <div className="empty-state">
                      <FileText size={40} style={{ opacity: 0.3 }} />
                      <div>
                        <strong>No documents uploaded yet</strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          Upload PDF, Word (DOCX), or JSON files to start querying.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <table className="modern-table">
                      <thead>
                        <tr>
                          <th>Filename</th>
                          <th>Type</th>
                          <th>Size</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc) => (
                          <tr key={doc.id}>
                            <td style={{ fontWeight: 500 }}>{doc.filename}</td>
                            <td>{doc.file_type}</td>
                            <td>{(doc.file_size / 1024).toFixed(1)} KB</td>
                            <td>
                              <span className={`status-badge ${doc.status.toLowerCase()}`}>
                                {doc.status}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="delete-action-btn"
                                onClick={() => handleDeleteDocument(doc.id)}
                                title="Delete document"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* New Session Title Modal */}
      {isNewSessionModalOpen && (
        <div className="auth-container" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', zIndex: 999 }}>
          <div className="auth-card glass" style={{ width: '400px' }}>
            <h2 className="card-title">New Chat Session</h2>
            <form onSubmit={handleCreateSession}>
              <div className="form-group">
                <label className="form-label">Session Title</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Remote Work Policy Queries"
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsNewSessionModalOpen(false);
                    setNewSessionTitle('');
                  }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'error' ? (
              <AlertCircle size={18} />
            ) : toast.type === 'info' ? (
              <ShieldAlert size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

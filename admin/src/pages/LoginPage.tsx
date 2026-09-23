import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>ALMUS CHAT</h1>
        <p style={styles.subtitle}>Admin Dashboard</p>
        <input
          style={styles.input}
          type="email"
          placeholder="Admin email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f172a',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  card: {
    background: '#1e293b',
    padding: '2.5rem',
    borderRadius: '12px',
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  title: { color: '#22c55e', margin: 0, fontSize: '1.5rem', textAlign: 'center' },
  subtitle: { color: '#94a3b8', margin: '0 0 1rem', textAlign: 'center', fontSize: '0.9rem' },
  input: {
    padding: '0.65rem 0.8rem',
    borderRadius: '8px',
    border: '1px solid #334155',
    background: '#0f172a',
    color: 'white',
    outline: 'none',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.7rem',
    borderRadius: '8px',
    border: 'none',
    background: '#22c55e',
    color: '#0f172a',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#f87171', fontSize: '0.85rem', margin: 0 },
};

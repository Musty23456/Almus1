import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await apiRequest<{ users: User[] }>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateStatus(id: string, status: User['status']) {
    if (!confirm(`Set this user's status to ${status}?`)) return;
    await apiRequest(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } });
    load();
  }

  async function deleteUser(id: string) {
    if (!confirm('Permanently delete this user? This cannot be undone.')) return;
    await apiRequest(`/admin/users/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <h1>Users</h1>
      <div style={{ display: 'flex', gap: 8, margin: '1rem 0' }}>
        <input
          placeholder="Search by username, email, or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', flex: 1, maxWidth: 360 }}
        />
        <button onClick={load} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: '#0f172a', color: 'white' }}>
          Search
        </button>
      </div>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr style={{ textAlign: 'left', background: '#f1f5f9' }}>
            <th style={th}>Name</th>
            <th style={th}>Username</th>
            <th style={th}>Contact</th>
            <th style={th}>Status</th>
            <th style={th}>Joined</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={td}>{u.fullName}</td>
              <td style={td}>@{u.username}</td>
              <td style={td}>
                {u.email}
                <br />
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{u.phoneNumber}</span>
              </td>
              <td style={td}>
                <span style={{ ...badge, background: statusColor(u.status) }}>{u.status}</span>
              </td>
              <td style={td}>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td style={{ ...td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {u.status !== 'SUSPENDED' && (
                  <button style={actionBtn} onClick={() => updateStatus(u.id, 'SUSPENDED')}>Suspend</button>
                )}
                {u.status !== 'BANNED' && (
                  <button style={actionBtn} onClick={() => updateStatus(u.id, 'BANNED')}>Ban</button>
                )}
                {u.status !== 'ACTIVE' && (
                  <button style={actionBtn} onClick={() => updateStatus(u.id, 'ACTIVE')}>Reactivate</button>
                )}
                <button style={{ ...actionBtn, color: '#dc2626', borderColor: '#dc2626' }} onClick={() => deleteUser(u.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusColor(status: User['status']) {
  if (status === 'ACTIVE') return '#dcfce7';
  if (status === 'SUSPENDED') return '#fef9c3';
  return '#fee2e2';
}

const th: React.CSSProperties = { padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#475569' };
const td: React.CSSProperties = { padding: '0.75rem 1rem', fontSize: '0.85rem', verticalAlign: 'top' };
const badge: React.CSSProperties = { padding: '0.2rem 0.5rem', borderRadius: 6, fontSize: '0.75rem' };
const actionBtn: React.CSSProperties = {
  padding: '0.3rem 0.6rem',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  background: 'white',
  cursor: 'pointer',
};

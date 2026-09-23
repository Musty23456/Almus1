import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/users', label: 'Users' },
  { to: '/reports', label: 'Reports' },
  { to: '/groups', label: 'Groups' },
  { to: '/audit-logs', label: 'Audit Logs' },
  { to: '/settings', label: 'System Settings' },
];

export default function Layout() {
  const { admin, logout } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <aside style={{ width: 220, background: '#0f172a', color: 'white', padding: '1.5rem 1rem' }}>
        <h2 style={{ color: '#22c55e', fontSize: '1.1rem' }}>ALMUS CHAT</h2>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: -8 }}>Admin</p>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 24 }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              style={({ isActive }) => ({
                padding: '0.5rem 0.75rem',
                borderRadius: 6,
                textDecoration: 'none',
                color: isActive ? '#0f172a' : '#e2e8f0',
                background: isActive ? '#22c55e' : 'transparent',
                fontSize: '0.9rem',
              })}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 32, borderTop: '1px solid #334155', paddingTop: 16 }}>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{admin?.name}</p>
          <p style={{ fontSize: '0.7rem', color: '#64748b' }}>{admin?.role}</p>
          <button
            onClick={logout}
            style={{
              marginTop: 8,
              background: 'transparent',
              border: '1px solid #334155',
              color: '#e2e8f0',
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, background: '#f8fafc', padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}

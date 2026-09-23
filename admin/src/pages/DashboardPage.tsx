import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface Stats {
  totalUsers: number;
  onlineUsers: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  totalMessages: number;
  totalGroups: number;
  pendingReports: number;
  suspendedUsers: number;
  bannedUsers: number;
  databaseStatus: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Stats>('/admin/dashboard').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: '#dc2626' }}>{error}</p>;
  if (!stats) return <p>Loading…</p>;

  const cards: [string, number | string][] = [
    ['Total users', stats.totalUsers],
    ['Online now', stats.onlineUsers],
    ['New today', stats.newUsersToday],
    ['New this week', stats.newUsersThisWeek],
    ['Total messages', stats.totalMessages],
    ['Total groups', stats.totalGroups],
    ['Pending reports', stats.pendingReports],
    ['Suspended users', stats.suspendedUsers],
    ['Banned users', stats.bannedUsers],
    ['Database', stats.databaseStatus],
  ];

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
        {cards.map(([label, value]) => (
          <div key={label} style={{ background: 'white', borderRadius: 10, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>{label}</p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '1.6rem', fontWeight: 700, color: '#0f172a' }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

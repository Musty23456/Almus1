import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface Report {
  id: string;
  targetType: string;
  reason: string;
  details?: string;
  status: string;
  createdAt: string;
  reportedBy?: { username: string };
  reportedUser?: { username: string };
}

const STATUSES = ['PENDING', 'INVESTIGATING', 'RESOLVED', 'REJECTED'];

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState('PENDING');

  async function load() {
    const data = await apiRequest<{ reports: Report[] }>(`/admin/reports?status=${filter}`);
    setReports(data.reports);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function setStatus(id: string, status: string) {
    await apiRequest(`/admin/reports/${id}`, { method: 'PATCH', body: { status } });
    load();
  }

  return (
    <div>
      <h1>Reports</h1>
      <div style={{ display: 'flex', gap: 8, margin: '1rem 0' }}>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: filter === s ? '#0f172a' : 'white',
              color: filter === s ? 'white' : '#0f172a',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {reports.length === 0 && <p style={{ color: '#64748b' }}>No {filter.toLowerCase()} reports.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map((r) => (
          <div key={r.id} style={{ background: 'white', borderRadius: 10, padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>
                {r.targetType} — {r.reason.replace(/_/g, ' ')}
              </strong>
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            {r.details && <p style={{ color: '#334155', fontSize: '0.9rem' }}>{r.details}</p>}
            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Reported by @{r.reportedBy?.username} {r.reportedUser ? `— against @${r.reportedUser.username}` : ''}
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {STATUSES.filter((s) => s !== r.status).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(r.id, s)}
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}
                >
                  Mark {s.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

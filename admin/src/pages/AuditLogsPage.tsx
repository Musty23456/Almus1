import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface AuditLog {
  id: string;
  action: string;
  target?: string;
  createdAt: string;
  admin: { name: string; email: string; role: string };
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    apiRequest<{ logs: AuditLog[] }>('/admin/audit-logs').then((d) => setLogs(d.logs));
  }, []);

  return (
    <div>
      <h1>Audit Logs</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {logs.map((log) => (
          <div key={log.id} style={{ background: 'white', padding: '0.75rem 1rem', borderRadius: 8, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>
              <strong>{log.admin.name}</strong> ({log.admin.role}) — {log.action.replace(/_/g, ' ')}
              {log.target && <span style={{ color: '#64748b' }}> → {log.target}</span>}
            </span>
            <span style={{ color: '#94a3b8' }}>{new Date(log.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

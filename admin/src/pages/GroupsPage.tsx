import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface Group {
  id: string;
  name: string;
  description?: string;
  members: unknown[];
  owner: { username: string };
  createdAt: string;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    apiRequest<{ groups: Group[] }>('/admin/groups').then((d) => setGroups(d.groups));
  }, []);

  return (
    <div>
      <h1>Groups</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 10 }}>
        <thead>
          <tr style={{ textAlign: 'left', background: '#f1f5f9' }}>
            <th style={th}>Name</th>
            <th style={th}>Owner</th>
            <th style={th}>Members</th>
            <th style={th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={td}>{g.name}</td>
              <td style={td}>@{g.owner.username}</td>
              <td style={td}>{g.members.length}</td>
              <td style={td}>{new Date(g.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = { padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#475569' };
const td: React.CSSProperties = { padding: '0.75rem 1rem', fontSize: '0.85rem' };

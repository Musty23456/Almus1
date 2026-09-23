import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface Setting {
  key: string;
  value: string;
}

const SUGGESTED_KEYS = [
  'maintenance_mode',
  'registration_enabled',
  'max_upload_size_mb',
  'max_group_members',
  'announcement_message',
  'min_supported_app_version',
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiRequest<{ settings: Setting[] }>('/admin/settings');
    setSettings(data.settings);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(k: string, v: string) {
    setError(null);
    try {
      await apiRequest('/admin/settings', { method: 'PATCH', body: { key: k, value: v } });
      setKey('');
      setValue('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Only SUPER_ADMIN can change settings');
    }
  }

  return (
    <div>
      <h1>System Settings</h1>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {settings.map((s) => (
          <div key={s.key} style={{ background: 'white', padding: '0.75rem 1rem', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
            <code>{s.key}</code>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <h3>Set a value</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input list="keys" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle} />
        <datalist id="keys">
          {SUGGESTED_KEYS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <input placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
        <button onClick={() => save(key, value)} style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: '#0f172a', color: 'white' }}>
          Save
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' };

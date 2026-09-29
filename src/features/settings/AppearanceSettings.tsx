import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '@/lib/theme';
import { Card, CardHeader } from '@/components/ui/Card';

const OPTIONS: Array<{ id: ThemePref; label: string; icon: typeof Sun }> = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'system', label: 'Match my device', icon: Monitor },
];

export function AppearanceSettings() {
  const [theme, setTheme] = useTheme();
  return (
    <Card>
      <CardHeader title="Theme" subtitle="Saved on this device." />
      <div className="grid-3" role="radiogroup" aria-label="Theme" style={{ gap: 8 }}>
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={theme === o.id} className="choice" onClick={() => setTheme(o.id)}>
            <o.icon size={18} aria-hidden="true" /> <span className="fw-500">{o.label}</span>
            <span className="choice__check" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Card>
  );
}

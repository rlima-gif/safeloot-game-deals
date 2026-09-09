'use client';

import { useEffect, useState } from 'react';
import { TimerReset } from 'lucide-react';

export function OfferDeadline({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); };
  }, []);
  if (!expiresAt || !Number.isFinite(expiresAt)) return null;
  const minutes = now === null ? null : Math.max(0, Math.ceil((expiresAt * 1000 - now) / 60_000));
  const label = minutes === null ? 'Consultando prazo…' : minutes === 0 ? 'Prazo encerrado · atualize a oferta' : `Termina em: ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  return <div className="deadline-strip"><TimerReset size={16} aria-hidden="true" /><span>{label}</span></div>;
}

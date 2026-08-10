'use client';

import { useEffect, useState } from 'react';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { clinicBranding, type ClinicBranding } from '@/data/clinicBranding';

/**
 * Reads the clinic row so the shell header can name the clinic rather than
 * the product. Most screens have no other reason to load it, so this keeps
 * the read in one place instead of adding a clinic fetch to eight of them.
 *
 * The fallback is passed in rather than imported so this stays free of the
 * i18n hook; the caller already has `t`.
 */
export function useClinicBranding(runtime: ClinicRuntime, fallback: ClinicBranding): ClinicBranding {
  const { revision } = useClinicRuntimeStatus();
  const [clinic, setClinic] = useState<{ name: string; address: string } | undefined>();

  useEffect(() => {
    let disposed = false;
    void runtime.db.clinic.toCollection().first().then((row) => {
      if (disposed || row === undefined) return;
      setClinic({ name: row.name, address: row.address });
    });
    return () => { disposed = true; };
    // Revision changes after bootstrap and after a sync applies a clinic edit,
    // so renaming the clinic in Set-up reaches the header without a reload.
  }, [revision, runtime]);

  return clinicBranding(clinic, fallback);
}

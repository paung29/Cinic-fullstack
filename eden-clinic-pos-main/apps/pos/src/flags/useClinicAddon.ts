'use client';

import { useEffect, useState } from 'react';
import { useClinicRuntimeStatus } from '@/app/providers';
import type { JsonValue } from '@/data/types';

export function clinicAddonEnabled(addons: Record<string, JsonValue> | undefined, key: 'recall'): boolean {
  return addons?.[key] === true;
}

export function useClinicAddon(key: 'recall'): boolean {
  const { revision, runtime } = useClinicRuntimeStatus();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (runtime === undefined) {
      return undefined;
    }

    let active = true;
    void runtime.db.clinic.toCollection().first().then((clinic) => {
      if (active) setEnabled(clinicAddonEnabled(clinic?.addons, key));
    });
    return () => {
      active = false;
    };
  }, [key, revision, runtime]);

  return enabled;
}

import { useMemo } from 'react';

import type { Brand, ReferConfig } from '../types';
import BrandConfigCard from './BrandConfigCard';

interface Props {
  brands: Brand[];
  configs: ReferConfig[];
  loading: boolean;
  onChange: () => void;
}

export default function ConfigurationTab({ brands, configs, loading, onChange }: Props) {
  const configsByBrand = useMemo(() => {
    const map = new Map<string, ReferConfig>();
    for (const c of configs) map.set(String(c.brandId), c);
    return map;
  }, [configs]);

  if (loading) {
    return (
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-8 text-center text-sm text-gray-500'>
        Loading…
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className='bg-white/80 backdrop-blur-sm rounded-xl border border-violet-100 p-8 text-center'>
        <p className='text-sm text-gray-500'>
          No brands found. Create a brand first to configure Refer-a-Friend.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {brands.map((brand) => (
        <BrandConfigCard
          key={brand._id}
          brand={brand}
          existingConfig={configsByBrand.get(brand._id) || null}
          onSaved={onChange}
        />
      ))}
    </div>
  );
}

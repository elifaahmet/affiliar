import BSelectWithSearch from '@components/core-components/selectWithInput/BSelectWithSearch';

interface FilterControlsProps {
  activeTab: string;
  selectedBy: string;
  setSelectedBy: (val: string) => void;
  category: any;
  setCategory: (val: any) => void;
  provider: any;
  setProvider: (val: any) => void;
  selectedGame: any;
  setSelectedGame: (val: any) => void;
  gameOptions: any[];
  categories: any[];
  providers: any[];
  currency: any;
  setCurrency: (val: any) => void;
  currencyArray: any[];
}

export default function FilterControls({
  activeTab,
  selectedBy,
  setSelectedBy,
  category,
  setCategory,
  provider,
  setProvider,
  selectedGame,
  setSelectedGame,
  gameOptions,
  categories,
  providers,
  currency,
  setCurrency,
  currencyArray,
}: FilterControlsProps) {
  if (activeTab === 'by-all') return null;
  return (
    <>
      {activeTab === 'by-game' && (
        <BSelectWithSearch
          options={[
            { label: 'Category', value: '1' },
            { label: 'Provider', value: '2' },
          ]}
          value={selectedBy}
          onChange={(value) => {
            setSelectedBy(value);
            setCategory(null);
            setProvider(null);
          }}
          showSearch={false}
          classname="w-full h-full bg-white"
          label="Select by"
        />
      )}

      {(activeTab === 'by-game' && selectedBy === '1') ||
      (activeTab !== 'by-provider' && activeTab !== 'by-game') ? (
        <BSelectWithSearch
          options={categories}
          value={category || ''}
          onChange={(val: string) => setCategory(val ? JSON.parse(val) : '')}
          classname="w-full h-full bg-white"
          label="Game Category"
          valueIsObject={true}
          showSearch={true}
        />
      ) : null}

      {activeTab !== 'by-category' && (activeTab !== 'by-game' || selectedBy === '2') && (
        <BSelectWithSearch
          options={providers}
          value={provider || ''}
          onChange={(val: string) => setProvider(val ? JSON.parse(val) : '')}
          classname="w-full h-full bg-white"
          label="Providers"
          valueIsObject={true}
          showSearch={true}
        />
      )}

      {activeTab !== 'by-category' && activeTab !== 'by-provider' && (
        <BSelectWithSearch
          label="Game Name"
          value={selectedGame || ''}
          onChange={(val: string) => setSelectedGame(val ? JSON.parse(val) : '')}
          options={gameOptions}
          valueIsObject={true}
        />
      )}

      <BSelectWithSearch
        options={currencyArray}
        value={currency || ''}
        onChange={(val: string) => setCurrency(val ? JSON.parse(val) : '')}
        label="Currency"
        showSearch={false}
        valueIsObject={true}
      />
    </>
  );
}

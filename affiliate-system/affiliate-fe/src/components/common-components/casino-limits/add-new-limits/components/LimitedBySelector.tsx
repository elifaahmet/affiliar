import Icon from '@components/core-components/icon';

interface Option {
  label: string;

  value: 'category' | 'provider' | 'all' | 'daily' | 'weekly' | 'monthly';
  icon: string;
}

interface Props {
  limitedBy: 'category' | 'provider' | 'all' | 'daily' | 'weekly' | 'monthly';
  setLimitedBy: (
    val: 'category' | 'provider' | 'all' | 'daily' | 'weekly' | 'monthly'
  ) => void;
  setActiveTab?: (tab: string) => void;
  timeBased?: boolean;
}

const options: Option[] = [
  { label: 'Limit for All', value: 'all', icon: 'performance' },
  { label: 'Category', value: 'category', icon: 'categoryChip' },
  { label: 'Provider', value: 'provider', icon: 'providerChip' },
];
const timeoptions: Option[] = [
  { label: 'Daily Limit', value: 'daily', icon: 'daily' },
  { label: 'Weekly Limit', value: 'weekly', icon: 'weekly' },
  { label: 'Monthly Limit', value: 'monthly', icon: 'monthly' },
];
const LimitedBySelector = ({ limitedBy, setLimitedBy, setActiveTab, timeBased = false }: Props) => {
  const optionsToUse = timeBased ? timeoptions : options;
  return (
    <div className="flex flex-row gap-3 pb-2">
      {optionsToUse.map((item) => {
        const isActive = limitedBy === item.value;

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setLimitedBy(item.value);
              if (setActiveTab) setActiveTab(`by-${item.value}`);
            }}
            className={`flex items-center justify-center gap-2  h-full  ${timeBased ? 'min-w-[184px]' : 'min-w-[135px]'}  px-3  py-3 rounded-[10px] w-full border transition-all font-extrabold text-sm
    ${
      isActive
        ? 'bg-primary-light border-primary text-primary'
        : 'bg-gray-200 border-gray-400 text-gray-700'
    }`}
          >
            <Icon
              iconName={item.icon}
              svgProps={{
                width: 22,
                height: 22,
                fill: isActive ? '#8B5CF6' : '#4B5675',
              }}
            />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default LimitedBySelector;

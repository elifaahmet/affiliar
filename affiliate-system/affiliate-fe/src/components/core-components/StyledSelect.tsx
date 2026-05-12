import { Fragment } from 'react';
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from '@headlessui/react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/20/solid';

/**
 * Drop-in replacement for native <select> with a styled dropdown panel
 * that matches the violet design system. Uses Headless UI's Listbox so
 * the dropdown auto-portals out of any backdrop-filter ancestor (same
 * fix we applied to the modals via createPortal — Listbox does it for
 * us under the hood).
 *
 * Generic over the value type so it can carry strings, numbers, or
 * tagged union literals without TS gymnastics on the caller side.
 */

export interface StyledSelectOption<T> {
  value: T;
  label: string;
  /** Optional secondary line under the label inside the dropdown panel. */
  description?: string;
  disabled?: boolean;
}

interface StyledSelectProps<T> {
  value: T;
  onChange: (value: T) => void;
  options: Array<StyledSelectOption<T>>;
  placeholder?: string;
  /** Width / padding overrides (defaults to a 2.25rem-tall input). */
  className?: string;
  disabled?: boolean;
  /** Optional aria-label when there's no surrounding <label>. */
  ariaLabel?: string;
}

export default function StyledSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  ariaLabel,
}: StyledSelectProps<T>) {
  const selected = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className}`}>
        <ListboxButton
          aria-label={ariaLabel}
          className={`group flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span className={`truncate ${selected ? '' : 'text-gray-600'}`}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDownIcon
            className='ml-2 h-4 w-4 shrink-0 text-gray-600 transition-transform ui-open:rotate-180 group-hover:text-violet-700'
            aria-hidden='true'
          />
        </ListboxButton>

        <Transition
          as={Fragment}
          leave='transition ease-in duration-75'
          leaveFrom='opacity-100'
          leaveTo='opacity-0'
        >
          <ListboxOptions
            anchor='bottom start'
            className='z-[70] mt-1 w-[var(--button-width)] origin-top overflow-auto rounded-xl border border-violet-100 bg-white/95 py-1 text-sm shadow-xl shadow-violet-200/40 backdrop-blur-md focus:outline-none [--anchor-gap:0.25rem] [--anchor-max-height:18rem]'
          >
            {options.length === 0 && (
              <p className='px-3 py-2 text-xs text-gray-600'>No options.</p>
            )}
            {options.map((opt) => (
              <ListboxOption
                key={String(opt.value)}
                value={opt.value}
                disabled={opt.disabled}
                className='group relative flex cursor-pointer items-start gap-2 px-3 py-2 text-gray-700 data-[focus]:bg-violet-50 data-[focus]:text-violet-900 data-[selected]:font-medium data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50'
              >
                <div className='min-w-0 flex-1'>
                  <p className='truncate'>{opt.label}</p>
                  {opt.description && (
                    <p className='truncate text-[11px] text-gray-600 group-data-[focus]:text-violet-700'>
                      {opt.description}
                    </p>
                  )}
                </div>
                <CheckIcon
                  className='h-4 w-4 shrink-0 text-primary opacity-0 group-data-[selected]:opacity-100'
                  aria-hidden='true'
                />
              </ListboxOption>
            ))}
          </ListboxOptions>
        </Transition>
      </div>
    </Listbox>
  );
}

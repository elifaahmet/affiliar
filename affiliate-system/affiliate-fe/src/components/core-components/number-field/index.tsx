/* Shared numeric input.

   Behaves like the fee / "min wager" gate inputs on the Fees page: a value of
   0 (or null) renders as a blank field with a placeholder, and focusing the
   field selects its contents — so you never have to delete a leading "0"
   before typing.

   It is *uncontrolled* (defaultValue, not value): a controlled
   `<input type=number value={someNumber}>` fights the browser on every
   keystroke and leaves a stuck leading zero (type "0" before "5" → "05" parses
   back to 5 → React skips the re-render → "05" stays). Uncontrolled means the
   field shows exactly what you typed, and we still report a clean number up via
   onChange. Because it's uncontrolled, callers that render it in a list must
   give each instance a stable React key so a removed row can't leave its value
   behind in a shifted sibling. */
interface NumberFieldProps {
  value: number | null | undefined;
  onChange: (n: number) => void;
  /** Store/emit in cents but display & edit in whole units. */
  fromCents?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function NumberField({
  value,
  onChange,
  fromCents = false,
  min = 0,
  max,
  step = 1,
  placeholder = '0',
  disabled,
  className,
}: NumberFieldProps) {
  const numeric = value == null ? null : fromCents ? value / 100 : value;
  const display = numeric == null || numeric === 0 ? '' : String(numeric);
  return (
    <input
      type='number'
      min={min}
      max={max}
      step={step}
      defaultValue={display}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const units = e.target.value === '' ? 0 : Number(e.target.value) || 0;
        onChange(fromCents ? Math.round(units * 100) : units);
      }}
      className={className}
    />
  );
}

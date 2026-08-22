import type { InputHTMLAttributes, Ref } from 'react';

export type NumberFieldMode = 'integer' | 'decimal' | 'fraction';

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  /**
   * Current value as a **string** so the field can be cleared mid-edit — a number-bound
   * input snaps back to the old value (or 0) the instant you delete the last digit.
   */
  value: string;
  /** Receives the raw string. Parse + clamp when you commit (on blur/submit). */
  onChange: (value: string) => void;
  /**
   * What kind of numeric value this field holds:
   * - `integer` (default) — whole numbers (servings, hours/minutes). `type=number`, numeric keypad.
   * - `decimal` — fractional decimals (e.g. a substitution ratio). `type=number`, decimal keypad.
   * - `fraction` — free-text amounts incl. slash fractions like `1 1/2`. `type=text`, decimal keypad;
   *   keystrokes are restricted to digits, spaces, `.` and `/`.
   */
  mode?: NumberFieldMode;
  /** Forwarded to the underlying `<input>` (e.g. to focus it programmatically). */
  ref?: Ref<HTMLInputElement>;
}

/** Characters allowed in a `fraction`-mode field: digits, slash, dot, space. */
const FRACTION_CHARS = /^[0-9/. ]*$/;

/**
 * Empty-able numeric input. Holds its value as a string so the field can be cleared while
 * typing; bind it to string state and parse/clamp the value when you commit. Shared by the
 * recipe form (servings, step times, ingredient amounts), the meal plan form (servings),
 * the recipe-detail serving scaler, the cook-mode timers, and the substitution ratio.
 */
export function NumberField({ value, onChange, onWheel, mode = 'integer', ...rest }: NumberFieldProps) {
  const isFraction = mode === 'fraction';
  return (
    <input
      type={isFraction ? 'text' : 'number'}
      inputMode={mode === 'integer' ? 'numeric' : 'decimal'}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        // In fraction mode, silently reject keystrokes outside the allowed character set.
        if (isFraction && !FRACTION_CHARS.test(next)) return;
        onChange(next);
      }}
      // Blur on wheel for the numeric spinner so scrolling never silently changes the value.
      // A fraction field is plain text (no spinner), so leave its wheel behaviour untouched.
      onWheel={isFraction ? onWheel : (e) => { e.currentTarget.blur(); onWheel?.(e); }}
      {...rest}
    />
  );
}

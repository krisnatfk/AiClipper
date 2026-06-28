import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-primary mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full bg-card border border-border rounded-lg px-4 py-2.5 text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all duration-200',
            error && 'border-alert focus:ring-alert/50',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-alert">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-secondary">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

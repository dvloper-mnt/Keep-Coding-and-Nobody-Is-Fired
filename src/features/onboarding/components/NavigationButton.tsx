'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface NavigationButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant: ButtonVariant;
  readonly children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    'px-5 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0b]',
  secondary:
    'px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0b]',
  ghost:
    'px-5 py-2 text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0b] rounded',
};

export const NavigationButton = forwardRef<HTMLButtonElement, NavigationButtonProps>(
  function NavigationButton({ variant, children, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`${VARIANT_STYLES[variant]}${className ? ` ${className}` : ''}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

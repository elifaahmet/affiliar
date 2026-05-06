import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@components/core-components/icon';

import { footerLinks } from './data';

type AuthLayoutProps = {
  children: ReactNode;
};

/**
 * Split-screen auth shell.
 *
 *  - Left (60%): editorial brand panel. Subtle violet-tinted gradient mesh
 *    behind a large display-serif headline + tight body. No marketing
 *    cards — keeps the eye on the message and the form.
 *  - Right (40%): white form column. The actual auth form (Login / Forgot /
 *    OTP) renders into `children` and styles itself against this clean
 *    background.
 *  - Footer: thin, single-line, sits across the full width.
 */
function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen w-full bg-white">
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ── Left: editorial brand panel ───────────────────────────────── */}
        <div className="relative hidden lg:flex lg:w-[58%] xxl:w-3/5 overflow-hidden bg-[#0a0a0a]">
          {/* Gradient mesh — soft violet glow on a near-black canvas */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-90"
            style={{
              background: `
                radial-gradient(60% 60% at 22% 18%, rgba(139, 92, 246, 0.55) 0%, rgba(139, 92, 246, 0) 60%),
                radial-gradient(45% 45% at 85% 100%, rgba(192, 132, 252, 0.35) 0%, rgba(192, 132, 252, 0) 70%),
                radial-gradient(50% 60% at 100% 30%, rgba(99, 102, 241, 0.25) 0%, rgba(99, 102, 241, 0) 60%)
              `,
            }}
          />
          {/* Grain — subtle film texture so the gradient doesn't feel flat */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
            }}
          />

          {/* Content */}
          <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full text-white">
            <div className="flex items-center gap-3">
              <Icon iconName="affiliar" svgProps={{ width: 160, height: 32 }} />
            </div>

            <div className="max-w-xl">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50 mb-6">
                Affiliate management for iGaming operators
              </p>
              <h1 className="font-display text-5xl xl:text-6xl leading-[1.05] tracking-tight">
                Run your affiliate program.{' '}
                <span className="italic text-violet-300">With clarity.</span>
              </h1>
              <p className="mt-6 text-base leading-relaxed text-white/70">
                One workspace for commission plans, real-time NGR, sub-affiliate networks and
                payouts. Casino, sportsbook, or both — every number in one place.
              </p>
            </div>

            <div className="flex items-center gap-8 text-xs text-white/50">
              <span>©  {new Date().getFullYear()} Affiliar</span>
              <span className="h-3 w-px bg-white/20" />
              <span>Built for fast decisions and clear, actionable insights.</span>
            </div>
          </div>
        </div>

        {/* ── Right: form column ────────────────────────────────────────── */}
        <div className="flex flex-1 items-center justify-center px-6 py-16 lg:px-12">
          {children}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto flex max-w-[1700px] flex-col items-center justify-between gap-3 px-6 py-5 sm:flex-row sm:px-10">
          <p className="text-xs text-gray-400">
            ©  {new Date().getFullYear()} Affiliar
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500">
            {footerLinks.map((link, index) => (
              <Link
                key={index}
                to={link.to}
                className="transition-colors hover:text-gray-900"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AuthLayout;

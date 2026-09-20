'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Lookup' },
  { href: '/history', label: 'History' },
  { href: '/queue', label: 'Queue' },
  { href: '/settings', label: 'API keys' },
  { href: '/docs', label: 'API docs' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => {
        const active =
          link.href === '/'
            ? pathname === '/'
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`focus-ring rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-white/20 text-white'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

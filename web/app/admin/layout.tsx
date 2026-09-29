"use client";

import { usePathname } from 'next/navigation';
import './admin.css';
import { AdminNav } from './admin-nav';

// Login renders its own full-page .admin-auth-shell (see login/page.tsx)
// -- no session exists yet, so there's nothing for a sidebar to navigate
// to. Previously the sidebar rendered unconditionally regardless of route,
// leaving an empty sidebar column beside the login card for a signed-out
// visitor -- same bug fixed the same way in portal/layout.tsx.
const NO_SIDEBAR_PATHS = ['/admin/login'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (NO_SIDEBAR_PATHS.includes(pathname)) {
    return (
      <div className="admin-root">
        {children}
      </div>
    );
  }

  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">Shops Platform</div>
          <div className="admin-sidebar-tag">Operator console</div>
          <AdminNav />
        </aside>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}

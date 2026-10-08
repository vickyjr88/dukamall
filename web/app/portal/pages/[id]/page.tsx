"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { portalFetch } from '../../portal-api';
import { ApiPage, PageForm } from '../page-form';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState<ApiPage | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    portalFetch(`/portal/pages/${id}`).then(async (res) => {
      if (res.ok) setPage(await res.json());
      else setMissing(true);
    });
  }, [id]);

  if (missing) return <div className="portal-empty">That page doesn&apos;t exist any more.</div>;
  if (!page) return <p>Loading...</p>;
  return <PageForm page={page} />;
}
